define([], function() {
  
  var _annotations = [];
  
  /**
   * A container object that manages (surprise) annotations,
   * and provides a number of helper functions related to 
   * displaying them graphically on the screen.
   * 
   * TODO store annotations in a quadtree for improved collision detection
   */  
  var Annotations = function() { };
  
  /** Helper to compute the rectangle from an annotation geometry **/
  Annotations.getRect = function(annotation, opt_minheight) {     
    var minheight = (opt_minheight) ? opt_minheight : 0,
        geom = annotation.shapes[0].geometry,
        height = (Math.abs(geom.h) > 1) ? geom.h : minheight, // Make sure annotation is clickable, even with null height!
        a = { x: geom.x, 
              y: geom.y },
        b = { x: a.x + Math.cos(geom.a) * geom.l,
              y: a.y - Math.sin(geom.a) * geom.l },
        c = { x: b.x - height  * Math.sin(geom.a),
              y: b.y - height * Math.cos(geom.a) },
        d = { x: a.x - height * Math.sin(geom.a),
              y: a.y - height * Math.cos(geom.a) };

    return [ a, b, c, d ];
  };   
  
  Annotations.getTranscription = function(annotation) {
    return (annotation.corrected_toponym) ? annotation.corrected_toponym : annotation.toponym;
  }; 
  
  /** Helper function to compute the bounding box for a rectangle **/
  Annotations.getBBox = function(annotation) {
    var rect = Annotations.getRect(annotation, 5);
    return {
      top: Math.min(rect[0].y, rect[1].y, rect[2].y, rect[3].y),
      right: Math.max(rect[0].x, rect[1].x, rect[2].x, rect[3].x),
      bottom: Math.max(rect[0].y, rect[1].y, rect[2].y, rect[3].y),
      left: Math.min(rect[0].x, rect[1].x, rect[2].x, rect[3].x)
    }
  };
  
  /** Helper function to fetch full annotation details from the server **/
  Annotations.fetchDetails = function(annotation, callback) {
    if (jQuery.isArray(annotation)) {
      // TODO it's possibly better to support this scenario on the server side
      // and do things with a single request
      var ajaxCallsRemaining = annotation.length;
      
      jQuery.each(annotation, function(idx, a) {
        jQuery.ajax({
          url: '/recogito/api/annotations/' + a.id,
          type: 'GET',
          success: function(response) {
            jQuery.extend(a, response);
            ajaxCallsRemaining -= 1;
            
            if (ajaxCallsRemaining <= 0)
              callback(annotation);
          }
        });        
      });
    } else {
      jQuery.ajax({
        url: '/recogito/api/annotations/' + annotation.id,
        type: 'GET',
        success: function(response) {
          jQuery.extend(annotation, response);
          callback(annotation);
        }
      });
    }    
  };
  
  /** Returns a list of nearby annotations, sorted by distance **/
  Annotations.findNearby = function(annotation, opt_limit) {
    var limit = (opt_limit) ? opt_limit : _annotations.length,
        thisGeom = annotation.shapes[0].geometry,
        annotationsAndDistance = [];
    
    // TODO optimize with a quadtree
    jQuery.each(_annotations, function(idx, a) {
      var otherGeom = a.shapes[0].geometry,
          dx = thisGeom.x - otherGeom.x,
          dy = thisGeom.y - otherGeom.y,
          distanceSq = Math.pow(dx, 2) + Math.pow(dy, 2);

      if (a.id !== annotation.id)
        annotationsAndDistance.push({ annotation: a, distance: distanceSq });
    });
    
    annotationsAndDistance.sort(function(a,b) {
      return a.distance - b.distance;
    });
    
    return jQuery.map(annotationsAndDistance, function(obj) {
      return obj.annotation;
    }).slice(0, limit);
  };
  
  /** Tests if the given coordinate intersects the rectangle **/
  var _intersects = function(x, y, rect) {
    var inside = false,
        j = 3; // rect.length - 1 (but we know rect.length is always 4)
        
    for (var i=0; i<4; i++) {
      if ((rect[i].y > y) != (rect[j].y > y) && 
          (x < (rect[j].x - rect[i].x) * (y - rect[i].y) / (rect[j].y-rect[i].y) + rect[i].x)) {
        inside = !inside;
      }
      j = i;
    }
    return inside;
  };
  
  /** Returns all annotations **/
  Annotations.prototype.getAll = function() {
    return _annotations;
  };
  
  Annotations.prototype.findById = function(id) {
    var annotation = jQuery.grep(_annotations, function(annotation, idx) {
      return annotation.id === id;
    });
    
    if (annotation.length > 0)
      return annotation[0];
  };
  
  /** Returns the annotations at a specifix X/Y coordinate **/
  Annotations.prototype.getAnnotationsAt = function(x, y) {
    // TODO optimize with a quadtree
    var hovered = [];
    jQuery.each(_annotations, function(idx, annotation) {
      var rect = Annotations.getRect(annotation, 5);
      if(_intersects(x, y, rect))
        hovered.push(annotation);
    });
    return hovered;
  }
  
  /** Adds a single annotation, or an array of annotations **/
  Annotations.prototype.add = function(a) {
    if (jQuery.isArray(a))
      _annotations = jQuery.merge(_annotations, a);
    else
      _annotations.push(a);    
  };
  
  /** Removes the annotation with the specified ID **/
  Annotations.prototype.remove = function(id) {
    _annotations = jQuery.grep(_annotations, function(a) {
      return a.id != id;
    });    
  };
    
  return Annotations;
  
});
