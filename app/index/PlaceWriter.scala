package index

import java.io.{ File, InputStream }
import org.apache.lucene.index.{ IndexWriter, Term }
import org.apache.lucene.search.{ BooleanClause, BooleanQuery, IndexSearcher, PrefixQuery, TermQuery, TopScoreDocCollector }
import org.pelagios.Scalagios
import org.pelagios.api.gazetteer.Place
import org.pelagios.api.gazetteer.patch.PatchConfig
import play.api.Logger
import java.io.FileInputStream

trait PlaceWriter extends PlaceReader {
  
  def addPlaces(places: Iterator[Place]): Int =  { 
    val distinctNewPlaces = places.foldLeft(0)((distinctNewPlaces, place) => {
      val isDistinct = addPlace(place, placeWriter)
      if (isDistinct)
        distinctNewPlaces + 1 
      else
        distinctNewPlaces
    })
    
    distinctNewPlaces
  }
  
  def addPlaceStream(is: InputStream, filename: String): (Int, Int) = {    
    var totalPlaces = 0
    var distinctNewPlaces = 0
    def placeHandler(place: Place): Unit = {
      val isDistinct = addPlace(place, placeWriter)
      totalPlaces += 1
      if (isDistinct)
        distinctNewPlaces += 1
    }
    
    Scalagios.streamPlaces(is, filename, placeHandler, true)
    (totalPlaces, distinctNewPlaces)
  }
  
  private def addPlace(place: Place, writer: IndexWriter): Boolean = {
      val normalizedUri = PlaceIndex.normalizeURI(place.uri)
      
      // Enforce uniqueness
      if (findNetworkByPlaceURI(normalizedUri).isDefined) {
        Logger.warn("Place '" + place.uri + "' already in index!")
        false // No new distinct place
      } else {    
        // First, we query our index for all matches our new place has 
        val matches = (place.closeMatches ++ place.exactMatches).map(uri => {
          val normalized = PlaceIndex.normalizeURI(uri)
          (normalized, findNetworkByPlaceURI(normalized))
        })
        
        // These are the closeMatches we already have in our index        
        val indexedMatchesOut = matches.filter(_._2.isDefined).map(_._2.get)

        // Next, we query our index for places which list our new places as their closeMatch
        val indexedMatchesIn = findNetworkByCloseMatch(normalizedUri)
        
        val indexedMatches = (indexedMatchesOut ++ indexedMatchesIn)
        
        // These are closeMatch URIs we don't have in our index (yet)...
        val unrecordedMatchesOut = matches.filter(_._2.isEmpty).map(_._1)

        // ...but we can still use them to extend our network through indirect connections
        val indirectlyConnectedPlaces = 
          unrecordedMatchesOut.flatMap(uri => findNetworkByCloseMatch(uri))
          .filter(!indexedMatches.contains(_)) // We filter out places that are already connected directly

        val allMatches = indexedMatches ++ indirectlyConnectedPlaces

        // Update the index
        joinPlaceWithNetworks(IndexedPlace.toIndexedPlace(place), allMatches.distinct, writer);
        
        // If this place didn't have any closeMatches at all, it's a new distinct contribution
        allMatches.size == 0
      }      
  }
  
  /** Joins a place with a list of networks, and updates the index **/ 
  private def joinPlaceWithNetworks(place: IndexedPlace, affectedNetworks: Seq[IndexedPlaceNetwork], writer: IndexWriter) = {
    // Delete affected networks from index
    affectedNetworks.foreach(network => 
      writer.deleteDocuments(new TermQuery(new Term(Fields.URI, network.seedURI))))

    // Add the place and write updated network to index
    val updatedNetwork = IndexedPlaceNetwork.join(place, affectedNetworks)
    writer.addDocument(updatedNetwork.doc)
  }
  
  def applyPatch(file: File, config: PatchConfig) = {
    val patches = Scalagios.readPlacePatches(new FileInputStream(file), file.getAbsolutePath)
    Logger.info("Parsed " + patches.size + " patch records")
    
    patches.foreach(patch => {
      val affectedNetwork = findNetworkByPlaceURI(patch.uri)
      if (affectedNetwork.isEmpty) {
        Logger.warn("Could not patch place " + patch.uri + " - not in index")
      } else {
        Logger.info("Applying patch for " + patch.uri)
        
        val patchedNetwork = 
          if (config.propagatePatch) {
            // Update all places in network
            Logger.info("Propagating patch to " + (affectedNetwork.get.places.size - 1) + " network members")
            val patchedPlaces = affectedNetwork.get.places.map(_.patch(patch, config))
            IndexedPlaceNetwork.join(patchedPlaces)
          } else {
            // Update only the one place in the network with matching URI
            val unaffectedPlaces = affectedNetwork.get.places.filter(_.uri != patch.uri)
            val patchedPlace = affectedNetwork.flatMap(_.getPlace(patch.uri)).get
            IndexedPlaceNetwork.join(unaffectedPlaces :+ patchedPlace)
          }

          // updatePlaceInNetwork(patchedPlace, patchedPlace, writer)
        placeWriter.deleteDocuments(new TermQuery(new Term(Fields.URI, affectedNetwork.get.seedURI)))
        placeWriter.addDocument(patchedNetwork.doc)
      }
    })    
  }

  def deleteGazetter(prefixes: Seq[String]) = {
    val searcher = placeSearcherManager.acquire()
    try {
      // Need to loop through each affected record - so we'll do it in batches
      deleteGazetteerBatch(prefixes, searcher)
      refresh()
    } finally {
      placeSearcherManager.release(searcher)            
    }
  }
    
  private def deleteGazetteerBatch(prefixes: Seq[String], searcher: IndexSearcher, offset: Int = 0, batchSize: Int = 30000): Unit = {    
    val query = new BooleanQuery()
    prefixes.foreach(prefix =>
      query.add(new PrefixQuery(new Term(Fields.URI, prefix)), BooleanClause.Occur.SHOULD))
      
    val collector = TopScoreDocCollector.create(offset + batchSize, true) 
    searcher.search(query, collector)
    
    val total = collector.getTotalHits
    val affectedNetworks = collector.topDocs(offset, batchSize).scoreDocs
      .map(scoreDoc => new IndexedPlaceNetwork(searcher.doc(scoreDoc.doc))).toSeq

    // First, we delete all place networks from the affected batch      
    affectedNetworks.foreach(network => 
      placeWriter.deleteDocuments(new TermQuery(new Term(Fields.URI, network.seedURI))))
    
    // Then we update each place network and re-add to the index
    affectedNetworks.foreach(network => {
      val places = network.places.filter(place => !prefixes.exists(prefix => place.uri.startsWith(prefix)))
        
      // If the network is empty afterwards, we don't need to re-add
      if (places.size > 0) {
        val networksAfterRemoval = IndexedPlaceNetwork.buildNetworks(places)
        if (networksAfterRemoval.size > 1)
          networksAfterRemoval.foreach(network => placeWriter.addDocument(network.doc))
      }
    })      
      
    if (total > offset + batchSize)
      deleteGazetteerBatch(prefixes, searcher, offset + batchSize, batchSize)
  }

}
