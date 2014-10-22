/** Namespaces **/
var recogito = (window.recogito) ? window.recogito : { };

recogito.PublicMap = function(mapDiv, dataURL) {
  var self = this,
      dareLayer = L.tileLayer('http://pelagios.org/tilesets/imperium/{z}/{x}/{y}.png', {
    	  attribution: 'Tiles: <a href="http://imperium.ahlfeldt.se/">DARE 2014</a>'
      }),     
      awmcLayer = L.tileLayer('http://a.tiles.mapbox.com/v3/isawnyu.map-knmctlkh/{z}/{x}/{y}.png', {
        attribution: 'Tiles &copy; <a href="http://mapbox.com/" target="_blank">MapBox</a> | ' +
                     'Data &copy; <a href="http://www.openstreetmap.org/" target="_blank">OpenStreetMap</a> and contributors, CC-BY-SA | '+
                     'Tiles and Data &copy; 2013 <a href="http://www.awmc.unc.edu" target="_blank">AWMC</a> ' +
                     '<a href="http://creativecommons.org/licenses/by-nc/3.0/deed.en_US" target="_blank">CC-BY-NC 3.0</a>'
      });
      bingLayer = new L.BingLayer("Au8CjXRugayFe-1kgv1kR1TiKwUhu7aIqQ31AjzzOQz0DwVMjkF34q5eVgsLU5Jn"),
      osmOutdoorsLayer = L.tileLayer('http://{s}.tile.thunderforest.com/outdoors/{z}/{x}/{y}.png', {
	      attribution: '&copy; <a href="http://www.opencyclemap.org">OpenCycleMap</a>, &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>'
      }),
      gdocpart_switcher_template = 
        '<div class="publicmap-infobox">' +
        '  <div class="publicmap-layerswitcher">' +
        '  </div>' +
        '  <div class="publicmap-layerswitcher-all">' +
        '    <table>' +
        '      <tr>' + 
        '        <td><input type="checkbox" checked="checked" class="switch-all" /></td>' +
        '        <td>All</td>'
        '      </tr>' +
        '    </table>' +
        '  </div>' + 
        '</div>',
      legend_template = 
        '<div class="legend">' +
        '  <table>' +
        '    <tr><td><span class="dot" style="background-color:' + this.ColorPalette.getLightColor(1) + "; border-color:" + this.ColorPalette.getDarkColor(1) + ';"></span></td><td>Settlement</td></tr>' +
        '    <tr><td><span class="dot" style="background-color:' + this.ColorPalette.getLightColor(2) + "; border-color:" + this.ColorPalette.getDarkColor(2) + ';"></span></td><td>Region</td></tr>' +
        '    <tr><td><span class="dot" style="background-color:' + this.ColorPalette.getLightColor(3) + "; border-color:" + this.ColorPalette.getDarkColor(3) + ';"></span></td><td>Natural Feature</td></tr>' +
        '    <tr><td><span class="dot" style="background-color:' + this.ColorPalette.getLightColor(5) + "; border-color:" + this.ColorPalette.getDarkColor(5) + ';"></span></td><td>Artifical Structure</td></tr>' +
        '    <tr><td><span class="dot" style="background-color:' + this.ColorPalette.getLightColor(6) + "; border-color:" + this.ColorPalette.getDarkColor(6) + ';"></span></td><td>Ethnos</td></tr>' +
        '  </table>' +
        '</div>';
        
  this._map = new L.Map(mapDiv, {
    center: new L.LatLng(41.893588, 12.488022),
    zoom: 5,
    layers: [awmcLayer],
    minZoom: 3
  });
  
  var baseLayers = { 'Satellite': bingLayer, 
                     'OSM': osmOutdoorsLayer,
                     'Empty Base Map (<a href="http://awmc.unc.edu/wordpress/tiles/map-tile-information" target="_blank">AWMC</a>)': awmcLayer, 
                     'Roman Empire Base Map (<a href="http://imperium.ahlfeldt.se/" target="_blank">DARE</a>)': dareLayer };
  this._map.addControl(new L.Control.Layers(baseLayers, null, { position: 'topleft' }));
  
  // Fetch JSON data
  var loadIndicator = new recogito.LoadIndicator();
  loadIndicator.show();
  
  $.getJSON(dataURL, function(data) {
    if (data.annotations) {
      var layerGroup = L.layerGroup();
      layerGroup.addTo(self._map);
      $.each(data.annotations, function(annotationIdx, annotation) {
        self.addPlaceMarker(annotation, layerGroup);
      });    
      
      var legend = $(legend_template);
      legend.addClass('publicmap-infobox');
      legend.appendTo(mapDiv); 
      
      loadIndicator.hide();
    } else { 
      var layers = '<table>' +
                 '  <tr class="table-header"><td></td><td>Title</td><td># Toponyms</td><td></td>';
      var layerGroups = [];
    
      $.each(data.parts, function(partIdx, part) {
        layers += '<tr>' +
                    '<td><input type="checkbox" checked="true" data-part="' + partIdx + '" class="switch"></input></td>' +
                    '<td class="part-title">' + part.title + '</td>' +
                    '<td class="centered">' + part.annotations.length + '</td>';
        if (part.source)
          layers += '<td><a href="' + part.source + '" target="_blank">Text Online</a></td>';
        
        layers += '</tr>';
    
        var layerGroup = L.layerGroup();
        layerGroup.addTo(self._map);
        layerGroups.push(layerGroup);
      
        $.each(part.annotations, function(annotationIdx, annotation) {
          self.addPlaceMarker(annotation, layerGroup);
        });
      });
      layers += '</table>';
    
      var layer_switcher = $(gdocpart_switcher_template);
      layer_switcher.find('.publicmap-layerswitcher').append(layers);
      layer_switcher.prepend($(legend_template));
      layer_switcher.appendTo(mapDiv);
    
      layer_switcher.on('change', '.switch', function(e) {
        var part = parseInt($(e.target).data('part'), 10);
        var checked = $(e.target).prop('checked');
        if (checked)
          self._map.addLayer(layerGroups[part]);
        else
          self._map.removeLayer(layerGroups[part]);
      });
    
      layer_switcher.on('change', '.switch-all', function(e) {
        var checked = $(e.target).prop('checked');
        $('.switch').prop('checked', checked).trigger('change');
      });
      
      loadIndicator.hide();
    }
  });
    
}

recogito.PublicMap.prototype.addPlaceMarker = function(annotation, layerGroup) {
  var self = this,
      popupTemplate = 
    '<div class="publicmap-popup">' + 
    '  <span class="toponym">»{{toponym}}«</span> ({{title}})' +
    '  <p class="context">{{context}}</p>' +
    '  {{source}}' + 
    '  <p class="link">{{pelagios-link}}</p>' +
    '</div>';
    
  var highlightToponym = function(text, toponym) {
    var startIdx = text.indexOf(toponym);
    var endIdx = startIdx + toponym.length;
    if (startIdx > -1 && endIdx <= text.length) {
      var pre = text.substring(0, startIdx);
      var post = text.substring(endIdx);
      return pre + '<em>' + toponym + '</em>' + post;
    }
  };
  
  var loadDetails = function(annotationID, marker) {
    $.getJSON('/recogito/api/annotations/' + annotationID, function(a) {            
      var place = (a.place_fixed) ? a.place_fixed : a.place;
      var html = popupTemplate
                   .replace('{{toponym}}', a.toponym)
                   .replace('{{title}}', place.title)
                   .replace('{{pelagios-link}}', '<a target="_blank" href="http://pelagios.org/api/places/' + encodeURIComponent(place.uri) + '">Further resources about ' + place.title + '</a>');
                   
      if (a.source)
        html = html.replace('{{source}}', '<p class="link"><a href="' + a.source + '" target="_blank">Source Text</a></p>');
      else
        html = html.replace('{{source}}', '');
    
      if (a.context)
        html = html.replace('{{context}}', '...' + highlightToponym(a.context, a.toponym) + '...')
      else
        html = html.replace('{{context}}', '');
      
      marker.bindPopup(html).openPopup();
    });
  };
  
  if (annotation.status == 'VERIFIED') {
    var place = (annotation.place_fixed) ? annotation.place_fixed : annotation.place;
    
    if (place && place.coordinate) {
      var colIdx = 0;
      if (place.category == 'SETTLEMENT')
        colIdx = 1;
      else if (place.category == 'REGION')
        colIdx = 2;
      else if (place.category == 'ETHNOS')
        colIdx = 6;
      else if (place.category == 'NATURAL_FEATURE')
        colIdx = 3;
      else if (place.category == 'MAN_MADE_STRUCTURE')
        colIdx = 5;

      var stroke = self.ColorPalette.getDarkColor(colIdx),
          fill = self.ColorPalette.getLightColor(colIdx);
        
      var style = { color: stroke, fillColor:fill, radius: 4, weight:2, opacity:1, fillOpacity: 1 }
      var marker = L.circleMarker(place.coordinate, style);
      marker.on('click', function() { loadDetails(annotation.id, marker); });
      layerGroup.addLayer(marker);
    }
  }
}

recogito.PublicMap.prototype.ColorPalette = {
  
  _dark: [ '#828282', '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf' ],  
  
  _light: [ '#b2b2b2', '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5', '#c49c94', '#f7b6d2', '#c7c7c7', '#dbdb8d', '#9edae5' ],
  
  getDarkColor: function(idx) { return this._dark[idx % this._dark.length]; },
  
  getLightColor: function(idx) { return this._light[idx % this._light.length] }
  
}

/**
 * The load indicator, backed by a plain old DIV. Will
 * be hidden after creation.
 * @constructor
 */
recogito.LoadIndicator = function() {
  this.element = document.createElement('div');
  this.element.className = 'load-indicator';
  this.element.style.visibility = 'hidden';
  this._deferredIndicator;
  document.body.appendChild(this.element);
}

/**
 * Shows the load indicator.
 */
recogito.LoadIndicator.prototype.show = function() {
  var self = this;
  this._deferredIndicator = setTimeout(function() {
    self.element.style.visibility = 'visible';
    delete self._deferredIndicator;
  }, 200); 
}

/**
 * Hides the load indicator.
 */
recogito.LoadIndicator.prototype.hide = function() {
  if (this._deferredIndicator)
    clearTimeout(this._deferredIndicator);
  this.element.style.visibility = 'hidden';
}

