define(['georesolution/common'], function(common) {
          
  var element, map,
  
      /** DOM element templates **/
      searchContainer = jQuery(
        '<div id="search-input">' +
        '  <input>' +
        '  <div class="btn search" title="Search"><span class="icon">&#xf002;</span></div>' + 
        '  <div class="btn labeled fuzzy-search" title="Search including similar terms"><span class="icon">&#xf002;</span> Fuzzy</div>' + 
        '  <div class="btn labeled zoom-all" title="Zoom to All Results"><span class="icon">&#xf0b2;</span> All</div>' + 
        '  <div class="btn labeled clear" title="Clear Search Results"><span class="icon">&#xf05e;</span> Clear</div>' + 
        '</div>'),
        
      resultsContainer = jQuery('<div id="search-results"></div>'),
  
      /** DOM element shorthands **/
      searchInput = searchContainer.find('input'),
      
      btnSearch = searchContainer.find('.btn.search'),
      btnFuzzySearch = searchContainer.find('.btn.fuzzy-search'),
      btnZoomAll = searchContainer.find('.btn.zoom-all'),
      btnClearSearch = searchContainer.find('.btn.clear'),
      
      /** List of supported gazetteers **/
      KnownGazetteers = {
        'http://pleiades.stoa.org' : 'Pleiades',
        'http://data.pastplace.org' : 'PastPlace',
        'http://www.imperium.ahlfeldt.se': 'DARE'
      },
      
      /** Helper function that groups search results by gazetteers **/
      groupByGazetteer = function(results) {
        var allGrouped = {};
        
        jQuery.each(results, function(idx, result) {
          var gazetteer = KnownGazetteers[result.uri.substr(0, result.uri.indexOf('/', 7))],
              key = (gazetteer) ? gazetteer : 'Other', 
              group = allGrouped[key];
          
          if (group)
            group.push(result);
          else
            allGrouped[key] = [result];
        });     
        
        return allGrouped
      };
  
  /** An overlay component for the details map to filter search results **/
  var SearchControl = function(parentEl, detailsMap) {
    var self = this,
        
        search = function(query) {
          detailsMap.clearSearchresults();
          jQuery.getJSON('api/search/place?query=' + query, function(response) {
            var grouped = groupByGazetteer(response.results);
            detailsMap.showSearchresults(grouped);
            btnZoomAll.show();
            btnClearSearch.show();
            self.showResults(response.results, grouped);
          });
        };
    
    // Events
    searchInput.keypress(function(e) {
      if (e.which == 13)
        search(e.target.value.toLowerCase());
    });
    
    btnSearch.click(function() { search(searchInput.val().toLowerCase()); });
    btnFuzzySearch.click(function() { search(searchInput.val().toLowerCase() +  '~'); });
    btnZoomAll.click(function() { detailsMap.fitToSearchresults(); });
    btnClearSearch.click(function() { 
      self.resetSearch(); 
      self.focus();
    });
    
    // Assemble DOM
    resultsContainer.hide();
    parentEl.append(searchContainer);
    parentEl.append(resultsContainer);   
    
    element = parentEl;
    map = detailsMap;
    
    common.HasEvents.apply(this);
  };
  SearchControl.prototype = Object.create(common.HasEvents.prototype);
  
  /** Shows search results **/
  SearchControl.prototype.showResults = function(results, resultsGrouped) {
    var self = this, html = '<table>',
    
        /** A function to make the control scrollable if it exceeds the height of the map **/
        toggleScrollBarsIfNeeded = function() {
          var maxHeight = element.height() - searchContainer.outerHeight(),
              resultsHeight = resultsContainer.outerHeight();
          
          if (resultsHeight > maxHeight)
            resultsContainer.css('height', maxHeight);
        };
    
    jQuery.each(resultsGrouped, function(gazetteer, results) {
      html += '<tbody class="group">' +
              '  <tr>' +
              '    <th class="toggle icon">&#xf196;</th>' +
              '    <th class="min"><input type="checkbox" value="' + gazetteer + '" checked="true"></th>' +
              '    <th class="gazetteer-name"><strong>' + gazetteer + '</strong> ' + resultsGrouped[gazetteer].length + ' results</th>' +
              '    </tr>' +
              '</tbody>' +
              '<tbody class="results">';   
              
      jQuery.each(results, function(idx, result) {
        html += '<tr data-uri="' + result.uri + '">' +
                '  <td></td>' +
                '  <td colspan="2" class="names">';
               
        if (!result.coordinate)
          html += '<span class="icon no-coords" title="No coordinates for this place">&#xf041;</span>';
              
        html += '    <strong title="' + common.Utils.formatGazetteerURI(result.uri) + '">' + result.title + '</strong>' +
                     common.Utils.categoryTag(result.category) + '<br/>' +
                '    <small>' + result.names.slice(0, 8).join(', ') + '<br/>' + result.description + '</small>' +
                '   </td>' +
                '</tr>';
      });
    });
    html += '</tbody></table>';

    resultsContainer.html(html);
    
    // Hide results and add toggle
    resultsContainer.find('.results').hide();
    resultsContainer.find('.toggle').click(function(e) {
      resultsContainer.css('height', 'auto');
      jQuery(this).closest('tbody').nextUntil('.group').slideToggle(300, toggleScrollBarsIfNeeded);
    });
    
    // Enable checkboxes
    resultsContainer.on('click', ':checkbox', function(e) {
      var checkbox = $(this);
      if (checkbox.is(':checked'))
        map.setLayerVisibility(checkbox.val(), true);
      else
        map.setLayerVisibility(checkbox.val(), false);
    });
    
    // Enable mouse hover
    resultsContainer.on('mouseenter', 'tbody.results tr', function(e) {
      var uri, tr = jQuery(e.target).closest('tr');
      if (tr) {
        uri = tr.data('uri');
        if (uri)
          map.selectSearchresult(uri);
      }
    });
    
    // Enable gazetteer assignment on click
    resultsContainer.on('click', 'tbody.results tr', function(e) {
      var selected = jQuery.grep(results, function(result) {
        var uri = jQuery(e.target).closest('tr').data('uri');
        return result.uri === uri;
      });

      if (selected.length > 0)
        self.fireEvent('selectSearchresult', selected[0]);
    });
    
    resultsContainer.show();
  };
  
  /** Sets the focus to the search box **/
  SearchControl.prototype.focus = function() {
    searchInput.focus();
  }
  
  /** Sets the maximum height for the control **/
  SearchControl.prototype.setMaxHeight = function(height) {
    var offset = searchContainer.outerHeight();
    
    // TODO when do we do this?    
    map.setLeftPadding(400);
        
    element.css('max-height', height + 'px');
  };
  
  /** Resets the search **/
  SearchControl.prototype.resetSearch = function(presetQuery) {
    searchInput.val(presetQuery);
    btnZoomAll.hide();
    btnClearSearch.hide();
    map.clearSearchresults();
    resultsContainer.empty();
    resultsContainer.hide();
  };
  
  return SearchControl;
  
});