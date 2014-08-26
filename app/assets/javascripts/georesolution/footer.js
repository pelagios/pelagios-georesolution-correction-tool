define(function() {

  /**
   * A footer element for the UI that displays basic document metadata.
   * @param {Element} footerDiv the DIV to hold the footer
   */
  var Footer = function(footerDiv) {
    this.element = $(footerDiv).find('#footer-info');
  };

  /**
   * Sets the document metadata on the footer.
   * @param {Object} the annotation data
   */
  Footer.prototype.setData = function(data) {
    var count = function(status) {
      var list;
      if ($.isArray(status)) {
        list = $.grep(data, function(annotation, idx) { return status.indexOf(annotation.status) > -1; });
      } else {
        list = $.grep(data, function(annotation, idx) { return annotation.status == status; });
      }
      return list.length;
    };
  
    var total = data.length;
    var verified = count('VERIFIED');
    var not_identifyable = count(['NO_SUITABLE_MATCH', 'AMBIGUOUS', 'MULTIPLE', 'NOT_IDENTIFYABLE']);
    var false_detection = count('FALSE_DETECTION');
    var ignore = count('IGNORE');
    var complete = verified / (total - not_identifyable - false_detection - ignore);
  
    $(this.element).html(
      data.length + ' Annotations &nbsp; ' + 
      '<span class="icon">&#xf14a;</span> ' + verified + ' &nbsp; ' + 
      '<span class="icon">&#xf024;</span> ' + not_identifyable + ' &nbsp; ' + 
      '<span class="icon">&#xf057;</span> ' + false_detection + ' &nbsp;' +
      '<span class="icon">&#xf05e;</span> ' + ignore + ' &nbsp; - &nbsp; ' + 

      (complete * 100).toFixed(1) + '% Complete');
  };

  return Footer;
  
});
