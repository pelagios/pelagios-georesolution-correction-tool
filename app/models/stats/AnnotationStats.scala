package models.stats

import models.Annotation
import org.pelagios.api.Place
import global.Global
import org.pelagios.gazetteer.GazetteerUtils

object AnnotationStats {
  
  def uniqueTags(annotations: Iterable[Annotation]): Seq[String] = {
    val uniqueCombinations = annotations.groupBy(_.tags).keys.filter(_.isDefined).map(_.get).toSeq
    uniqueCombinations.map(_.split(",")).flatten.toSet.toSeq
  }
  
  def uniquePlaces(annotations: Iterable[Annotation]): Seq[(Place, Int)] = {
    val uniqueURIs = annotations.groupBy(_.validGazetteerURI.map(GazetteerUtils.normalizeURI(_))) // Group by (normalized!) valid URI
      .filter { case (uri, annotations) => uri.isDefined && uri.get.trim.size > 0 } // Filter empty URIs
      .map(tuple => (tuple._1.get, tuple._2.size)).toSeq // Map to (uri -> no. of occurrences)
      
    // Map from (uri -> occurrences) to (place -> occurrences)
    uniqueURIs.map(tuple => (Global.index.findByURI(tuple._1), tuple._2)) 
      .map(tuple => (tuple._1.get, tuple._2)) // We should never have any undefined URIs in practice - if we do: fail early, fail often!
      .sortBy(t => (-t._2, t._1.title))
  }

}