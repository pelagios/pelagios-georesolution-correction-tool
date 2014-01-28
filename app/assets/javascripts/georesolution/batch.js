define(['georesolution/common'], function(common) {
  
  /**
   * A popup containing 'batch processing' features that affect a list of annotations 
   * as a whole.
   * 
   * Emits the following events:
   * 'update' .............. when a correction is saved 
   * 
   * @param {Object} annotations the annotations
   */
  var BatchPopup = function(annotations) {
    // Inheritance - not the nicest pattern but works for our case
    common.HasEvents.call(this);
  
    var self = this,
        template =
          '<div class="clicktrap">' +
          '  <div class="popup">' +
          '    <div class="popup-header">' +
          '     <span id="batch-header-title"></span>' +
          '      <a class="popup-exit">&#xf00d;</a>' +
          '    </div>' +
          '    <div class="popup-content">' +
          '      <div class="popup-content-inner">' +
          '        <p><strong>Unique toponyms:</strong> <span id="batch-unique-toponyms"></span></p>' + 
          '        <p><strong>Unique gazetteer IDs:</strong> <span id="batch-unique-uris"></span></p>' + 
          '        <p><strong>Tags in Common:</strong></p>' + 
          '        <div class="popup-tags">' +
          '        </div>' +      
          '      </div>' +
          '    </div>' +
          '  </div>' +
          '</div>';
        
    // Details Popup DOM element
    this.element = $(template);
    this.element.appendTo(document.body);
    $('.popup-exit').click(function() { self.destroy(); });
  
    // Populate the template
    $('#batch-header-title').html(annotations.length + ' Annotations Selected');
    $('#batch-unique-toponyms').html(uniqueToponyms(annotations).join(', '));
    $('#batch-unique-uris').html(uniqueGazetteerURIs(annotations).join(', '));
    // $('#batch-unique-tags').html(uniqueTags(annotations).join(', '));
  
    // Tags
    var originalTags = commonTags(annotations);
    var tagList = new common.TagList($('.popup-tags'), commonTags(annotations));  
    
    tagList.on('update', function(updatedTags) {
      var diff = diffTags(originalTags, updatedTags);
      
      // TODO update annotations
      
      originalTags = updatedTags.slice();
    });
  }

  // Inheritance - not the nicest pattern but works for our case
  BatchPopup.prototype = new common.HasEvents();

  /**
   * Destroys the popup.
   */
  BatchPopup.prototype.destroy = function() {
    $(this.element).remove();
  }

  /** Private elper functions **/

  /**
   * Returns the list of unique toponyms that occur in the annotations.
   * @param {Array.<Object>} annotations the annotations
   */
  var uniqueToponyms = function(annotations) {
    var unique = [];
    $.each(annotations, function(idx, annotation) {
      if (unique.indexOf(annotation.toponym) == -1)
        unique.push(annotation.toponym);
    }); 
    return unique;
  }

  /**
   * Returns the list of unique gazetteer URIs that occur in the annotations.
   * @param {Array.<Object>} annotations the annotations
   */
  var uniqueGazetteerURIs = function(annotations) {
    var unique = [];
    $.each(annotations, function(idx, annotation) {
      var place = (annotation.place_fixed) ? annotation.place_fixed : annotation.place;
      if (place)
        if (unique.indexOf(place.uri) == -1)
          unique.push(place.uri);
    }); 
    return unique;
  }

  /**
   * Returns the list of unique tags that occur in the annotations.
   * @param {Array.<Object>} annotations the annotations
   */
  var commonTags = function(annotations) {
    // Step 1 - get a set of all tags in all annotations
    var commonTags = [];
    $.each(annotations, function(idx, annotation) {
      if (annotation.tags) {
        $.each(annotation.tags, function(idx, tag) {
          if (commonTags.indexOf(tag) == -1)
            commonTags.push(tag);
        });
      }
    });
    
    // Step 2 - remove tags every time there's an annotation that does not have it
    $.each(annotations, function(idx, annotation) {
      commonTags = $.grep(commonTags, function(tag) {
        if (!annotation.tags) {
          return false;
        } else {
          return annotation.tags.indexOf(tag) > -1;
        }
      });
    });

    return commonTags;
  }
  
  var diffTags = function(before, after) {
    // TODO implement
    return { add: [], remove: [] };
  }
   
  return BatchPopup;

});

