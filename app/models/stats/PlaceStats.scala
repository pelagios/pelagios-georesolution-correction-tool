package models.stats

import org.pelagios.api.gazetteer.Place
import org.pelagios.api.gazetteer.PlaceCategory

case class PlaceStats(uniquePlaces: Seq[(Place, Int)]) {

  lazy val uniquePlaceCategories: Seq[(Option[PlaceCategory.Category], Int)] =
    uniquePlaces.groupBy(_._1.category).mapValues(places => places.foldLeft(0)(_ + _._2)).toSeq.sortBy(_._2).reverse  
  
}