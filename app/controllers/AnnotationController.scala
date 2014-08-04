package controllers

import controllers.common.io.JSONSerializer
import global.Global
import java.io.ByteArrayOutputStream
import java.sql.Timestamp
import java.util.{ Date, UUID }
import models._
import play.api.libs.json.Json
import play.api.Logger
import play.api.mvc.{ Action, Controller }
import play.api.libs.json.{JsArray, JsObject }
import play.api.mvc.AnyContent
import org.pelagios.api.Agent
import org.pelagios.api.annotation.{ AnnotatedThing, Transcription, TranscriptionType, SpecificResource }
import org.pelagios.api.annotation.{ Annotation => OAnnotation }
import org.pelagios.api.annotation.selector.TextOffsetSelector
import org.pelagios.Scalagios
import org.pelagios.gazetteer.Network
import play.api.db.slick._
import play.api.Play.current

/** Annotation CRUD controller.
  *
  * @author Rainer Simon <rainer.simon@ait.ac.at> 
  */
object AnnotationController extends Controller with Secured {
  
  private val DARE_PREFIX = "http://www.imperium.ahlfeldt.se/"
    
  private val PLEIADES_PREFIX = "http://pleiades.stoa.org"
  
  private val UTF8 = "UTF-8"

  /** Creates a new annotation with (corrected) toponym and offset values.
    *
    * The annotation to create is delivered as JSON in the body of the request.
    */
  def create = protectedDBAction(Secure.REJECT) { username => implicit requestWithSession =>
    val user = Users.findByUsername(username)    
    val body = requestWithSession.request.body.asJson    
    if (!body.isDefined) {    
      // No JSON body - bad request
      BadRequest(Json.parse("{ \"success\": false, \"message\": \"Missing JSON body\" }"))
      
    } else {
      if (body.get.isInstanceOf[JsArray]) {
        // Use recursion to insert until we get the first error message  
        def insertNext(toInsert: List[JsObject], username: String): Option[String] = {
          if (toInsert.size == 0) {
            None
          } else {
            val errorMsg = createOne(toInsert.head, username)
            if (errorMsg.isDefined)
              errorMsg
            else
              insertNext(toInsert.tail, username)
          }
        }
 
        // Insert until error message
        val errorMsg = insertNext(body.get.as[List[JsObject]], username)
        if (errorMsg.isDefined)
          BadRequest(Json.parse(errorMsg.get))
        else
          Ok(Json.parse("{ \"success\": true }"))
      } else {
        val json = body.get.as[JsObject]
        try {
          val errorMsg = createOne(json, user.get.username)
          if (errorMsg.isDefined)
            BadRequest(Json.parse(errorMsg.get))
          else
            Ok(Json.parse("{ \"success\": true }"))
        } catch {
          case t: Throwable => {
            Logger.error("Error creating annotation: " + json)
            t.printStackTrace
            BadRequest("{ \"error\": \"" + t.getMessage + "\" }")
          }
        }
      }
    }  
  }
  
  private def createOneCTS(json: JsObject, username: String)(implicit s: Session): Option[String] = {
    val source = (json \ "source").as[String]
    val correctedToponym = (json \ "corrected_toponym").as[String]
    val correctedOffset = (json \ "corrected_offset").as[Int]        

    val annotation = 
      Annotation(Annotations.newUUID, None, None, 
                 AnnotationStatus.NOT_VERIFIED, None, None, None, None, 
                 Some(correctedToponym), Some(correctedOffset), None, source = Some(source))

    Annotations.insert(annotation)
    
    // Record edit event
    EditHistory.insert(EditEvent(None, annotation.uuid, username, new Timestamp(new Date().getTime),
      None, Some(correctedToponym), None, None, None, None))
                                                      
    None
  }
    
  private def createOne(json: JsObject, username: String)(implicit s: Session): Option[String] = {
    val jsonGdocId = (json\ "gdocId").asOpt[Int] 
    val jsonGdocPartId = (json \ "gdocPartId").asOpt[Int]  
    val jsonSource = (json \ "source").asOpt[String]
    
    if (jsonSource.isDefined) {
      createOneCTS(json, username)
    } else {
      val gdocPart = jsonGdocPartId.map(id => GeoDocumentParts.findById(id)).flatten
      val gdocId_verified = if (gdocPart.isDefined) Some(gdocPart.get.gdocId) else jsonGdocId.map(id => GeoDocuments.findById(id)).flatten.map(_.id).flatten
        
      if (!gdocPart.isDefined && !(jsonGdocId.isDefined && gdocId_verified.isDefined)) {
        // Annotation specifies neither valid GDocPart nor valid GDoc - invalid annotation
        Some("{ \"success\": false, \"message\": \"Invalid GDoc or GDocPart ID\" }")
        
      } else {
        // Create new annotation
        val correctedToponym = (json \ "corrected_toponym").as[String]
        val correctedOffset = (json \ "corrected_offset").as[Int]   
        
        val automatch = { 
          val networks = Global.index.query(correctedToponym, true).map(Global.index.getNetwork(_))
          val matches = Network.conflateNetworks(networks.toSeq, 
            Some(PLEIADES_PREFIX), // prefer Pleiades URIs
            Some(DARE_PREFIX),     // prefer DARE for coordinates
            Some(PLEIADES_PREFIX)) // prefer Pleiades for descriptions
            
          if (matches.size > 0)
            Some(matches.head)
          else
            None
        }
        
        val annotation = 
          Annotation(Annotations.newUUID, gdocId_verified, gdocPart.map(_.id).flatten, 
                     AnnotationStatus.NOT_VERIFIED, None, None, None, automatch.map(_.uri), 
                     Some(correctedToponym), Some(correctedOffset))
          
        if (!isValid(annotation)) {
          // Annotation is mis-aligned with source text or has zero toponym length - something is wrong
          Logger.info("Invalid annotation error: " + correctedToponym + " - " + correctedOffset + " GDoc Part: " + gdocPart.map(_.id))
          Some("{ \"success\": false, \"message\": \"Invalid annotation error (invalid offset or toponym).\" }")
          
        } else if (Annotations.getOverlappingAnnotations(annotation).size > 0) {
          // Annotation overlaps with existing ones - something is wrong
          Logger.info("Overlap error: " + correctedToponym + " - " + correctedOffset + " GDoc Part: " + gdocPart.get.id)
          Annotations.getOverlappingAnnotations(annotation).foreach(a => Logger.warn("Overlaps with " + a.uuid))
          Some("{ \"success\": false, \"message\": \"Annotation overlaps with an existing one (details were logged).\" }")
          
        } else {
          Annotations.insert(annotation)
    
          // Record edit event
          EditHistory.insert(EditEvent(None, annotation.uuid, username, new Timestamp(new Date().getTime),
            None, Some(correctedToponym), None, None, None, None))
                                                      
          None
        }
      }
    }   
  }
  
  /** Checks whether the annotation offset is properly aligned with the source text.
    * @param a the annotation 
    */
  private def isValid(a: Annotation)(implicit s: Session): Boolean = {
    val offset = if (a.correctedOffset.isDefined) a.correctedOffset else a.offset
    val toponym = if (a.correctedToponym.isDefined) a.correctedToponym else a.toponym

    if (offset.isDefined && toponym.isDefined) {
      if (toponym.get.trim.size == 0) {
        // If the toponym is a string with size 0 we'll discard immediately
        false
        
      } else {
        // Cross check against the source text, if available
        val text = GeoDocumentTexts.getTextForAnnotation(a).map(gdt => new String(gdt.text, UTF8))
        if (text.isDefined) {
          // Compare with the source text
          val referenceToponym = text.get.substring(offset.get, offset.get + toponym.get.size)
          referenceToponym.equals(toponym.get)
        } else {
          // We don't have a text for the annotation - so we'll just have to accept the offset
          true
        }
      }
    } else {
      // Annotation has no offset and/or toponym - so isn't tied to a text, and we're cool
      true
    }
  }
  
  /** Get a specific annotation.
    * 
    * The response also includes the 'context', i.e. a snippet showing
    * the toponym with surrounding source text (if the text is available
    * in the database).
    * @param id the annotation ID
    */
  def get(uuid: UUID) = DBAction { implicit session =>
    val annotation = Annotations.findByUUID(uuid)
    if (annotation.isDefined) {          
      Ok(JSONSerializer.toJson(annotation.get, true, true))
    } else {
      NotFound
    }
  }
  
  def forSource(source: String) = DBAction { implicit session =>    
    // Convert Recogito annotations to OA
    val basePath = routes.ApplicationController.index(None).absoluteURL(false)
    val thing = AnnotatedThing(basePath + "egd", source)
    
    Annotations.findBySource(source).foreach(a => {
      val place =  { if (a.correctedGazetteerURI.isDefined) a.correctedGazetteerURI else a.gazetteerURI }
        .map(Seq(_)).getOrElse(Seq.empty[String])
              
      val serializedBy = Agent("http://pelagios.org/recogito#version1.0", Some("Recogito Annotation Tool"))
      val offset = if (a.correctedOffset.isDefined) a.correctedOffset else a.offset
      val toponym = if (a.correctedToponym.isDefined) a.correctedToponym else a.toponym
      val transcription = toponym.map(t => Transcription(t, TranscriptionType.Toponym))
      val selector = offset.map(offset => TextOffsetSelector(offset, toponym.get.size))
      val target = if (selector.isDefined) SpecificResource(thing, selector.get) else thing
      val uri = basePath + "api/annotations/" + a.uuid          
      
      val oa = OAnnotation(uri, target, place = place, transcription = transcription, serializedBy = serializedBy)
    })

    val out = new ByteArrayOutputStream()
    Scalagios.writeAnnotations(Seq(thing), out, Scalagios.RDFXML)
    Ok(new String(out.toString(UTF8))).withHeaders(CONTENT_TYPE -> "application/rdf+xml", CONTENT_DISPOSITION -> ("attachment; filename=pelagios-egd.rdf"))      
  }
  
  def updateSingle(uuid: UUID) = protectedDBAction(Secure.REJECT) { username => implicit requestWithSession =>
    // Logger.info("Updating single annotation: " + uuid)
    update(Some(uuid), username)
  }
  
  def updateBatch() = protectedDBAction(Secure.REJECT) { username => implicit requestWithSession =>
    // Logger.info("Updating annotation batch")
    update(None, username)
  }
    
  /** Updates the annotation with the specified ID.
    *  
    * @param id the annotation ID to update
    */
  private def update(uuid: Option[UUID], username: String)(implicit requestWithSession: DBSessionRequest[AnyContent]) = {
    val body = requestWithSession.request.body.asJson    
    if (!body.isDefined) {    
      // No JSON body - bad request
      BadRequest(Json.parse("{ \"success\": false, \"message\": \"Missing JSON body\" }"))
      
    } else {
      if (body.get.isInstanceOf[JsArray]) {
        // Use recursion to update until we get the first error message
        def updateNext(toUpdate: List[JsObject], username: String): Option[String] = {
          if (toUpdate.size == 0) {
            None
          } else {
            val errorMsg = updateOne(toUpdate.head, None, username)
            if (errorMsg.isDefined)
              errorMsg
            else
              updateNext(toUpdate.tail, username)
          }
        }
 
        // Insert until error message
        val errorMsg = updateNext(body.get.as[List[JsObject]], username)
        if (errorMsg.isDefined)
          BadRequest(Json.parse(errorMsg.get))
        else
            Ok(Json.parse("{ \"success\": true }"))
      } else {
        if (uuid.isEmpty) {
          // Single annotation in JSON body, but no UUID provided - bad request
          BadRequest(Json.parse("{ \"success\": false, \"message\": \"Missing JSON body\" }"))
        } else {
          val errorMsg = updateOne(body.get.as[JsObject], uuid, username)
          if (errorMsg.isDefined)
            BadRequest(Json.parse(errorMsg.get))
          else
            Ok(Json.parse("{ \"success\": true }"))
        }
      }
    } 
  }
    
  private def updateOne(json: JsObject, uuid: Option[UUID], username: String)(implicit s: Session): Option[String] = {    
    val annotation = if (uuid.isDefined) {
        Annotations.findByUUID(uuid.get)        
      } else {
        (json \ "id").as[Option[String]].map(uuid => Annotations.findByUUID(UUID.fromString(uuid))).flatten
      }
      
    if (!annotation.isDefined) {
      // Someone tries to update an annotation that's not in the DB
      Some("{ \"success\": false, \"message\": \"Annotation not found\" }")      
    } else { 
      val correctedStatus = (json \ "status").as[Option[String]].map(AnnotationStatus.withName(_))
      val correctedToponym = (json \ "corrected_toponym").as[Option[String]]
      val correctedOffset = (json \ "corrected_offset").as[Option[Int]]
      val correctedURI = (json \ "corrected_uri").as[Option[String]]
      val correctedTags = (json \ "tags").as[Option[String]].map(_.toLowerCase)
      val correctedComment = (json \ "comment").as[Option[String]]
        
      val updatedStatus = correctedStatus.getOrElse(annotation.get.status)
      val updatedToponym = if (correctedToponym.isDefined) correctedToponym else annotation.get.correctedToponym
      val updatedOffset = if (correctedOffset.isDefined) correctedOffset else annotation.get.correctedOffset
      val updatedURI = if (correctedURI.isDefined) correctedURI else annotation.get.correctedGazetteerURI
      val updatedTags = if (correctedTags.isDefined) correctedTags else annotation.get.tags
      val updatedComment = if (correctedComment.isDefined) correctedComment else annotation.get.comment
   
      val toponym = if (updatedToponym.isDefined) updatedToponym else annotation.get.toponym
      val offset = if (updatedOffset.isDefined) updatedOffset else annotation.get.offset
                     
      val updated = 
        Annotation(annotation.get.uuid, annotation.get.gdocId, annotation.get.gdocPartId, 
                   updatedStatus,
                   annotation.get.toponym, annotation.get.offset, None, annotation.get.gazetteerURI, 
                   updatedToponym, updatedOffset, None, updatedURI, updatedTags, updatedComment, annotation.get.source)
                   
      // Important: if an annotation was created manually, and someone marks it as 'false detection',
      // We delete it instead!
      if (updated.status == AnnotationStatus.FALSE_DETECTION && !updated.toponym.isDefined)
        _delete(updated)
      else
        Annotations.update(updated)
          
      // Remove all overlapping annotations
      Annotations.getOverlappingAnnotations(updated).foreach(_delete(_))
        
      // Record edit event
      val user = Users.findByUsername(username) // The user is logged in, so we can assume the Option is defined
      EditHistory.insert(createDiffEvent(annotation.get, updated, user.get.username))
      None
    }
  }
  
  /** Deletes an annotation.
    *  
    * Note: we don't actually delete annotations, but just set their status to 'FALSE DETECTION'.
    * 
    * @param id the annotation ID 
    */
  def delete(uuid: UUID) = protectedDBAction(Secure.REJECT) { username => implicit requestWithSession =>
    val annotation = Annotations.findByUUID(uuid)
    if (!annotation.isDefined) {
      // Someone tries to delete an annotation that's not in the DB
      NotFound(Json.parse("{ \"success\": false, \"message\": \"Annotation not found\" }"))
      
    } else {
      val user = Users.findByUsername(username) // The user is logged in, so we can assume the Option is defined
      val updated = _delete(annotation.get)
        
      // Record edit event
      if (updated.isDefined)
        EditHistory.insert(createDiffEvent(annotation.get, updated.get, user.get.username))
        
      Ok(Json.parse("{ \"success\": true }"))
    } 
  }
  
  /** Deletes an annotation.
    *  
    * Note that an annotation deletion is a bit of complex issue. If we're dealing with a manually created annotation, 
    * we just delete it. Period. BUT: if we deal with an annotation that was created automatically, we still want to keep
    * it in the DB for the purposes of precision/recall estimation. In this case, we therefore don't delete the
    * annotation, but just mark it as a 'false detection'. If the annotation was manually modified, we also remove those
    * manual modifications to restore the original NER state. 
    * @param a the annotation
    */
  private def _delete(a: Annotation)(implicit s: Session): Option[Annotation] = {
    if (!a.toponym.isDefined) {
      Annotations.delete(a.uuid)
      None
    } else {
      val updated = Annotation(a.uuid, a.gdocId, a.gdocPartId,
                               AnnotationStatus.FALSE_DETECTION, 
                               a.toponym, a.offset, a.gazetteerURI,
                               None, None, None, None, None)
                                 
      Annotations.update(updated)    
      Some(updated)
    }
  }
  
  /** Private helper method that creates an update diff event by comparing original and updated annotation.
    * 
    * @param before the original annotation
    * @param after the updated annotation
    * @param userId the user who made the update
    */
  private def createDiffEvent(before: Annotation, after: Annotation, username: String)(implicit s: Session): EditEvent = {    
    val updatedStatus = if (before.status.equals(after.status)) None else Some(after.status)
    val updatedToponym = if (before.correctedToponym.equals(after.correctedToponym)) None else after.correctedToponym
    val updatedOffset = if (before.correctedOffset.equals(after.correctedOffset)) None else after.correctedOffset
    val updatedURI = if (before.correctedGazetteerURI.equals(after.correctedGazetteerURI)) None else after.correctedGazetteerURI
    val updatedTags = if (before.tags.equals(after.tags)) None else after.tags
    val updateComment = if (before.comment.equals(after.comment)) None else after.comment
    
    EditEvent(None, before.uuid, username, new Timestamp(new Date().getTime), Some(JSONSerializer.toJson(before, false, false).toString),
              updatedToponym, updatedStatus, updatedURI, updatedTags, updateComment)
  }

}
