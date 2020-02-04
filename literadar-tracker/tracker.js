/* 
 * LiteRadar tracker CC-BY-SA (c) 2019-2020 miktim@mail.ru
 * leaflet 1.0.1+ required
 */

(function(window, document) {
    T = {
        version: '0.0.1',
        isSmallScreen: (screen.width > 500) ? false : true,
        options: {
            mode: 'watch', // watch, nowatch, demo
            ws: '', // websocket address:port
            watch: {
                timeout: 180000, // milliseconds
                maximumAge: 120000, // milliseconds
                enableHighAccuracy: true
            },
            track: {
                minDistance: 20, // minimal track segment length (meters)
                multiplier: 0.5
            }
        },
        locale: {
            itsmeId: 'Own'
        },
        locations: [],
        icons: {},
        map: undefined
    };
    window.T = T;
    T.update = function(obj, opts) {
        for (var key in opts)
            if (key in obj)
                obj[key] = opts[key];
        return obj;
    };
    T.parseOptions = function(opt) {
        T.options.mode = opt.mode;
        T.options.ws = opt.ws;
        if ('watch' in opt) {
            var val = (opt.watch + '::').split(':');
            if (parseInt(val[0]))
                this.options.watch.timeout = parseInt(val[0]) * 1000;
            if (parseFloat(val[1])) // Infinity
                this.options.watch.maximumAge = parseFloat(val[1]) * 1000;
            if (val[2] === 't')
                this.options.watch.enableHighAccuracy = true;
            if (val[2] === 'f')
                this.options.watch.enableHighAccuracy = false;
        }
        if ('track' in opt) {
            var val = (opt.track + ':').split(':');
            if (parseInt(val[0]))
                this.options.track.minDistance = parseInt(val[0]);
            if (parseFloat(val[1]))
                this.options.track.multiplier = parseFloat(val[1]);
        }
    };
    T.latLng = function(obj) {
        if (Array.isArray(obj.latlng))
            obj.latlng = {lat: obj.latlng[0], lng: obj.latlng[1]};
        else if ('latitude' in obj && 'longitude' in obj)
            obj.latlng = {lat: obj.latitude, lng: obj.longitude};
        return obj;
    };
    T.makeIcon = function(url, isz) {
        isz = isz || 32;
        return L.icon({
            iconSize: [isz, isz],
            iconAnchor: [isz / 2, isz],
            iconUrl: url
        });
    };
    T.icons.own = T.makeIcon("./images/phone_y.png");
    T.icons.active = T.makeIcon("./images/phone_b.png");
// https://www.w3.org/TR/wake-lock/
// https://web.dev/wakelock/
    T.WakeLocker = function() {
        this.wakeLock = null;
        if ('getWakeLock' in navigator) {
            var wlTypes = ['system', 'screen'];
            for (var i = 0; i < 2; i++) {
                try {
                    this.wakeLock = navigator.getWakeLock(wlTypes[i]);
                    break;
                } catch (e) {
                    console.log(e.message);
                }
            }
        } else {
            console.log('WakeLock API not supported');
// https://github.com/richtr/NoSleep.js            
            return new NoSleep();
        }
        this.request = null;
        this.createRequest = function() {
            if (this.wakeLock && document.visibilityState === 'visible')
                this.request = this.wakeLock.createRequest();
        };
// https://stackoverflow.com/questions/1338599/the-value-of-this-within-the-handler-using-addeventlistener
        this.handleEvent = function(e) {
            if (e.type === 'visibilitychange' || e.type === 'fullscreenchange')
                this.createRequest();
        };
        this.enable = function() {
            document.addEventListener('visibilitychange', this);
            document.addEventListener('fullscreenchange', this);
            this.createRequest();
        };
        this.disable = function() {
            if (this.wakeLocker.request) {
                document.removeEventListener('visibilitychange', this);
                document.removeEventListener('fullscreenchange', this);
                this.request.cancel();
            }
        };
    };
    T.Location = function() {
        this.id = ''; // unique source id (string)
        this.itsme = false; // is own location
        this.latlng = undefined; // {lat, lng, alt?} WGS84
        this.accuracy = null; // meters (radius)
        this.speed = null; // meters per second
        this.altitude = null; // meters
        this.altitudeAccuracy = null; // meters
        this.heading = null; // degrees counting clockwise from true North
        this.timestamp = null; // acquired time in milliseconds
        this.timeout = null; // lifetime in milliseconds?
    };
// https://w3c.github.io/geolocation-api/
// leaflet.src.js section Geolocation methods
    T.locationWatcher = new function() {
        this.watchId = undefined;
        this.start = function(onFound, onError, options) {
            if (!('geolocation' in navigator)) {
                onError({
                    code: 0,
                    message: 'Geolocaton API not supported.'
                });
                return;
            }
            if (this.watchId)
                this.stop();
            this.lastLocation = undefined;
            this.isFree = true;
            this.locations = [];
            this.onLocationFound = onFound;
            var lw = this;
            this.watchId = navigator.geolocation.watchPosition(
                    function(l) {

                        if (!lw.lastLocation || lw.lastLocation.timestamp < l.timestamp) {
                            lw.lastLocation = l;
                            lw.onLocationFound(l);
                        }

                        /*                        
                         if (!lw.lastLocation) {
                         lw.lastLocation = l;
                         lw.locations.push(l);
                         lw.onLocationFound(l);
                         } else {
                         //                            if (lw.lastLocation.timestamp > l.timestamp) return;
                         
                         lw.locations.push(l);
                         if (lw.locations.length > 2 && lw.isFree) {
                         lw.isFree = false;
                         // centroid
                         var lat = 0, lng = 0, alt = 0, acc = 0, tme = 0
                         , nextLocation;
                         for (var i = 0; i < 3; i++) {
                         nextLocation = lw.locations.shift();
                         lat += nextLocation.coords.latitude;
                         lng += nextLocation.coords.longitude;
                         acc = Math.max(acc, nextLocation.coords.accuracy);
                         alt += nextLocation.coords.altitude;
                         tme = Math.max(tme, nextLocation.timestamp);
                         }
                         nextLocation.coords.latitude = lat / 3;
                         nextLocation.coords.longitude = lng / 3;
                         nextLocation.coords.altitude = alt / 3;
                         nextLocation.coords.accuracy = acc;
                         nextLocation.timestamp = tme; //Date.now();
                         //                                nextlocation.coords.heading =
                         //                                nextlocation.coords.speed =
                         //                                nextlocation.coords.altitudeAccuracy =
                         lw.lastLocation = nextLocation;
                         lw.isFree = true;
                         }
                         lw.onLocationFound(lw.lastLocation);
                         }
                         */
                    }, onError, options);
        };
        this.stop = function() {
            if (this.watchId) {
                navigator.geolocation.clearWatch(this.watchId);
                this.watchId = undefined;
            }
        };
    };
    T.onLocationFound = function(l) {
        var loc = new T.Location();
        T.update(loc, T.latLng(l.coords));
        loc.id = T.locale.itsmeId;
        loc.itsme = true;
        loc.timestamp = l.timestamp;
        loc.timeout = T.options.watch.timeout;
        T.onLocation(loc);
    };
    T.onLocationError = function(e) {
        e.message = 'Geolocation: ' + e.message;
        console.log(e.message);
        T.map.ui.consolePane.log(e.message);
    };
    T.onLocation = function(loc) {
        if (!this.map.isLoaded && this.locations.length === 0)
            this.map.setView(loc.latlng, this.map.options.zoom);
        if (!this.locations[loc.id]) {
            this.locations[loc.id] = loc;
        }
        this.map.setMarker(loc);
    };
    T.actions = [];
    T.actions['location'] = function(a) {
        T.onLocation(a);
    };
    T.actions['message'] = function(a) {
        T.map.ui.consolePane.log(a.message);
    };
    T.onAction = function(actionObj) {
        var action = T.actions[actionObj.action];
        if (action) {
            action(actionObj);
        }
    };
    T.onJSONmessage = function(m) {
        var actionObj = JSON.parse(m);
        T.onAction(actionObj);
    };
    T.checkWebSocket = function() {
        if (this.options.ws) {
            var wsurl = (window.location.protocol === 'https:' ?
                    'wss://' : 'ws://') + this.options.ws;
//            var wsurl = 'wss://' + this.search.ws;
            try {
                if ('webSocket' in T)
                    T.webSocket.close();
                T.webSocket = new WebSocket(wsurl);
                T.webSocket.onmessage = T.onJSONmessage;
                T.webSocket.onopen = function(e) {
                    T.sendJSONmessage = function(m) {
                        T.webSocket.send(m);
                    };
                    console.log('WebSocket open');
                };
                T.webSocket.onclose = function(e) {
                    console.log("WebSocket close");
                };
                T.webSocket.onerror = function(e) {
                    T.map.ui.consolePane.log(e.message);
                    console.log(e.message);
                };
            } catch (e) {
                console.log(e.message);
            }
        }
    };
    T.checkMode = function(mode) {
        return ((new RegExp('(^|,)' + mode + '(,|$)', 'i')).test(this.options.mode));
    };
    T.checkWatchMode = function() {
        if (!this.checkMode('nowatch')) {
            this.locationWatcher.start(
                    T.onLocationFound,
                    T.onLocationError,
                    T.options.watch);
            T.noSleep = new T.WakeLocker();
        } else {
            T.noSleep = {
                enable: function() {
                },
                disable: function() {
                }
            };
        }
    };
    T.checkDemoMode = function(latlng) {
        if (this.checkMode('demo'))
            this.demo.start(5000, latlng);
    };
    T.expirationTimer;
    T.checkExpiredLocations = function() {
        if (!this.expirationTimer) {
            this.expirationTimer = setInterval(function() {
                for (var id in T.locations) {
                    if (T.locations[id].timestamp + T.locations[id].timeout < Date.now())
                        T.map.setMarkerOpacity(T.locations[id], 0.4);
                }
            }, 60000);
        }
    };
    T.start = function(opts, mapId, latlng) {
        this.parseOptions(opts);
        this.map = T._ui.addTo(this._map(mapId)).load(latlng);
        this.map.once('locationfound', function(e) {
            T.checkDemoMode(e.latlng);
        });
        this.map.once('locationerror', function(e) {
            T.checkDemoMode();
        });
        this.checkWebSocket();
        this.checkWatchMode();
        this.checkExpiredLocations();
        window.addEventListener('unload', T.stop);
    };
    T.stop = function() {
        T.locationWatcher.stop();
        if ('webSocket' in T)
            T.webSocket.close();
        clearTimeout(T.expirationTimer);
        T.noSleep.disable();
        T.demo.stop();
    };
    T._map = function(mapId, latlng) {
        var map = L.map(mapId, {
            minZoom: 8,
            zoom: 17,
            zoomControl: false
        });
        L.tileLayer(window.location.protocol + '//{s}.tile.osm.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        map.ui = {}; // user interface
        map.isLoaded = false;
        map.markerLayer = L.featureGroup(); // markers
        map.addLayer(map.markerLayer);
        map.accuracyLayer = L.featureGroup(); // markers accuracy circles
        map.addLayer(map.accuracyLayer);
        map.showAccuracy = true;
        map.toggleAccuracy = function() {
            this.showAccuracy = !this.showAccuracy;
            if (this.showAccuracy) {
                if (!map.hasLayer(this.track.accuracyLayer))
                    this.addLayer(this.track.accuracyLayer);
                this.addLayer(this.accuracyLayer);
            } else {
                if (map.hasLayer(this.track.accuracyLayer))
                    this.removeLayer(this.track.accuracyLayer);
                this.removeLayer(this.accuracyLayer);
            }
            return this.showAccuracy;
        };
        map.markers = [];
        map.setMarkerOpacity = function(loc, opacity) {
            var marker = this.markers[loc.id];
            if (marker)
                marker.setOpacity(opacity);
        };
        map.setMarker = function(loc, icon) {
            icon = icon || (loc.itsme ? T.icons.own : T.icons.active);
            var marker = this.markers[loc.id];
            if (!marker) {
                marker = L.marker(loc.latlng, {icon: icon, alt: loc.id, title: loc.id});
                marker.on('click', function(e) {
                    map.onMarkerClick(e);
                });
                marker.addTo(this.markerLayer);
                marker.accuracyCircle = L.circle(loc.latlng, loc.accuracy,
                        {weight: 1, color: "blue"}).addTo(this.accuracyLayer);
                this.markers[loc.id] = marker;
            } else {
                marker.setLatLng(loc.latlng);
                marker.accuracyCircle.setLatLng(loc.latlng);
                marker.accuracyCircle.setRadius(loc.accuracy);
                marker.setOpacity(1);
            }
            marker.location = loc;
            this.trackMarker(marker);
            return marker;
        };
        map.searchMarkersById = function(pattern) { // markers or geofences
//            if (!'replaceAll' in String)  // javascript v8
// https://stackoverflow.com/questions/1144783/how-to-replace-all-occurrences-of-a-string
            String.prototype.replaceAll =
                    function(f, r) {
                        return this.split(f).join(r);
                    };
            pattern = '^' + pattern.replaceAll('?', '.{1}')
                    .replaceAll('*', '.*') + '$';
            var list = [];
            try {// mask regexp {}.[] etc symbols
                var rex = new RegExp(pattern, 'i');
            } catch (e) {
                console.log(e.message);
                return list;
            }
            for (var key in map.markers) { // 
                if (rex.test(key)) {
                    list[key] = map.markers[key];
                }
            }
            return list;
        };
        map.boundMarkers = function() {
            if (this.hasLayer(this.accuracyLayer))
                var bounds = this.accuracyLayer.getBounds();
            else
                var bounds = this.markerLayer.getBounds();
            this.fitBounds(bounds);
        };
        map.onMarkerClick = function(e) {
            var id = e.target.options.alt;
            var marker = this.markers[id];
            this.startTrack(marker);
        };
        map.track = {
            marker: undefined,
            pathLayer: undefined, // polyline
            rubberThread: undefined, //
            accuracyLayer: L.featureGroup(), // track nodes accuracy circles
            pathLength: 0,
            lastLocation: undefined
        };
        map.track.init = function(map) {
            if (map.hasLayer(this.accuracyLayer)) {
                map.removeLayer(this.accuracyLayer);
            }
            if (map.hasLayer(this.pathLayer)) {
                map.removeLayer(this.pathLayer);
            }
            if (map.hasLayer(this.rubberThread)) {
                map.removeLayer(this.rubberThread);
            }
            this.pathLayer = L.polyline([], {weight: 2, color: "red"}).addTo(map);
            this.rubberThread = L.polyline([], {weight: 2, color: "red"}).addTo(map);
            this.accuracyLayer = L.featureGroup();
            if (map.showAccuracy)
                map.addLayer(this.accuracyLayer);
            this.pathLength = 0;
            this.lastLocation = undefined;
        };
        map.startTrack = function(marker) {
            if (this.track.marker === marker) {
                if (marker.location.itsme) {
// disable noSleep 
                    T.noSleep.disable();
                    this.ui.consolePane.log('NoSleep OFF');
                }
                this.track.marker = undefined;
                this.track.rubberThread.setLatLngs([]);
//                if (this.ui.infoPane)
//                    this.ui.infoPane.remove(); // removeFrom(this); //0.7.0

            } else {
                if (marker.location.itsme) {
// enable noSleep 
                    T.noSleep.enable();
                    this.ui.consolePane.log('NoSleep ON');
                }
                /*                } else {
                 // disable noSleep  
                 T.noSleep.disable();
                 }
                 */
                this.track.init(this);
                this.track.started = marker.location.timestamp;
                if (!this.ui.infoPane)
                    this.ui.infoPaneCtl.addTo(this);
                this.track.marker = marker;
                this.trackMarker(marker);
            }
        };
        map.trackMarker = function(marker) {
            if (this.track.marker === marker) {
                var dist = 0;
                var step = T.options.track.minDistance;
                if (this.track.lastLocation) {
// flat distance() leaflet 1.0.1+                  
                    dist = map.distance(marker.location.latlng, this.track.lastLocation.latlng);
                    step = Math.max(step,
                            step * T.options.track.multiplier
                            * dist * 1000 / (marker.location.timestamp - this.track.lastLocation.timestamp));
                }
                if (!this.track.lastLocation || dist >= step) {
// ???check location 'jump' (dead zone?)
// replace nodes with heading deviation ~7 degree?
                    this.track.lastLocation = marker.location;
                    this.track.pathLayer.addLatLng(marker.location.latlng);
                    L.circle(marker.location.latlng, marker.accuracyCircle.getRadius(),
                            {weight: 1, color: "blue"}).addTo(this.track.accuracyLayer);
                    this.track.pathLength += dist;
                    this.track.rubberThread.setLatLngs([]);
                } else {
                    this.track.rubberThread.setLatLngs(
                            [this.track.lastLocation.latlng, marker.location.latlng]);
                }
                this.setView(marker.location.latlng, this.getZoom());
                this.ui.infoPane.update(L.Util.extend(marker.location, {
                    trackLength: this.track.pathLength,
                    trackTime: marker.location.timestamp - this.track.started,
                    movement: dist
                }));
            }
        };
        map.load = function(latlng) {
            this.once('load', function(e) {
                map.isLoaded = true;
            });
            this.on('locationfound', function(e) {
                map.ui.consolePane.log();
                map.setView(e.latlng, this.options.zoom);
            });
            this.on('locationerror', function(e) {
                this.ui.consolePane.log(e.message);
                console.log(e.message);
            });
            this.locateOwn(latlng);
            return this;
        };
        map.locateOwn = function(latlng) {
            if (latlng)
                this.setView(latlng, this.options.zoom);
            else {
                this.ui.consolePane.log('Expect location...', 120000);
                this.locate({setView: false}); // no load event
            }
            return this;
        };
        return map;
    };
    T._ui = {
        infoPaneCtl: new (L.Control.extend({
            options: {
                position: 'bottomleft',
                /* ????
                 * infoData: { 
                 * tables: [ 
                 * { title: function(data) { return ('Track: ' + data.id);},
                 *   style: [],
                 *   rows: [
                 *     ['DST', function(data) {return (Math.round(data.trackLength) +' m');}],
                 *     ['TTM', function(data) {return ((new Date(data.trackTime)).toISOString()
                 *                                   .substring(11, 19));}]
                 *   ],
                 * },
                 * { title: 'Location:',
                 *   styles: [],
                 *   rows: [
                 *   ]
                 * }]},
                 */
                infoData: {id: {nick: 'Track: ', unit: ''},
                    trackLength: {nick: 'DST', unit: 'm'},
                    trackTime: {nick: 'TTM', unit: ''},
                    timestamp: {nick: 'TME', unit: ''},
                    speed: {nick: 'SPD', unit: 'm/s'},
                    altitude: {nick: 'ALT', unit: 'm'},
                    movement: {nick: 'MVT', unit: 'm'},
                    heading: {nick: 'HDN', unit: '&deg'},
                    accuracy: {nick: 'ACC', unit: 'm'}
                }
            },
            onAdd: function(map) {
                var pane = L.DomUtil.create('div', 'tracker-pane')
                        , tbl, tbl1, row, el;
                pane.onclick = function(e) {
                    var pane = map.ui.infoPane.getContainer();
                    if (!pane.style.marginLeft) {
                        pane.style.marginLeft = '-100px';
                    } else {
                        pane.style.marginLeft = '';
                    }
                };
                el = L.DomUtil.create('div', 'tracker-title', pane);
                this.options.infoData.id.element = el;
                tbl = L.DomUtil.create('table', 'tracker-table', pane);
                el = L.DomUtil.create('div', 'tracker-title', pane);
                el.innerHTML = 'Location:';
                tbl1 = L.DomUtil.create('table', 'tracker-table', pane);
                for (var key in this.options.infoData) {
                    if (key === 'id')
                        continue;
                    if (key === 'timestamp')
                        tbl = tbl1;
                    row = L.DomUtil.create('tr', 'tracker-row', tbl);
                    el = L.DomUtil.create('td', 'tracker-info-nick', row);
                    el.innerHTML = this.options.infoData[key].nick;
                    el = L.DomUtil.create('td', 'tracker-info-value', row);
                    this.options.infoData[key].element = el;
                }
                map.ui.infoPane = this;
                return pane;
            },
            onRemove: function(map) {
                delete map.ui.infoPane;
            },
            update: function(info) {
                for (var key in this.options.infoData) {
                    if (!(key in info))
                        continue;
                    var value = info[key];
                    switch (key) {
                        case 'id':
                            value = this.options.infoData[key].nick + value;
                            break;
                        case 'timestamp' :
                            value = (new Date(value)).toTimeString()
                                    .substring(0, 8);
                            break;
                        case 'trackTime' :
                            value = (new Date(value)).toISOString()
                                    .substring(11, 19);
                            break;
                        default:
                            value = Math.round(value).toString();
                    }
                    this.options.infoData[key].element.innerHTML =
                            value + ' ' + this.options.infoData[key].unit;
                }
            }
        })),
        consolePaneCtl: new (L.Control.extend({
            options: {position: 'bottomright', timer: null},
            onAdd: function(map) {
                var pane = L.DomUtil.create('div', 'tracker-console');
                pane.hidden = true;
                map.ui.consolePane = this;
                return pane;
            },
            onRemove: function(map) {
                delete map.ui.consolePane;
            },
            log: function(m, timeout) {
                var pane = this.getContainer();
                if (m) {
                    pane.innerHTML = (new Date()).toTimeString().substring(0, 8)
                            + ' ' + m;
                    pane.hidden = false;
                    timeout = timeout || 10000;
                    if (this.options.timer)
                        clearTimeout(this.options.timer);
                    this.options.timer = setTimeout(function(t) {
                        t.getContainer().hidden = true;
                        t.options.timer = null;
                    }, timeout, this);
                } else {
                    pane.hidden = true;
                }
            }
        })),
        listPaneCtl: new (L.Control.extend({
            options: {
                position: 'topright'
            },
            onAdd: function(map) {
                var isTouchDevice = function() {
// https://stackoverflow.com/questions/4817029/whats-the-best-way-to-detect-a-touch-screen-device-using-javascript/4819886#4819886                    
                    var prefixes = ' -webkit- -moz- -o- -ms- '.split(' ');
                    var mq = function(query) {
                        return window.matchMedia(query).matches;
                    };
                    if (('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch) {
                        return true;
                    }
                    // include the 'heartz' as a way to have a non matching MQ to help terminate the join
                    // https://git.io/vznFH
                    var query = ['(', prefixes.join('touch-enabled),('), 'heartz', ')'].join('');
                    return mq(query);
                };
                var pane = L.DomUtil.create('div', 'tracker-pane')
                        , tbl, row, el, list = map.searchList;
                pane.onclick = function(e) {
                    if (e.target.tagName === 'IMG') {
                        var markerId = e.target.parentNode.parentNode.childNodes[2]
                                .innerHTML;
                        map.startTrack(map.markers[markerId]);
                    }
                    map.ui.listPane.remove();
                };
                var title = L.DomUtil.create('div', 'tracker-title', pane);
                var scrollDiv = L.DomUtil.create('div', 'tracker-scroll', pane);
// max-height on event orientationchange? deprecated! CSS?
                var scrollHeight = function(el, dh) {
                    var newHeight = ((window.innerHeight || document.documentElement.clientHeight) - 105) + 'px';
                    if (newHeight !== el.style.maxHeight) {
                        el.style.maxHeight = newHeight;
                    }
                };
                scrollHeight(scrollDiv, 105);
                this.options.timer = setInterval(scrollHeight
                        , 500, scrollDiv, 105);
                tbl = L.DomUtil.create('table', 'tracker-list', scrollDiv);
                var imgStyle = isTouchDevice() ? 'tracker-button' : 'tracker-list';
                var i = 0;
                for (var key in list) {
                    row = L.DomUtil.create('tr', 'tracker-list', tbl);
                    el = L.DomUtil.create('td', 'tracker-list-img', row);
                    var img = L.DomUtil.create('img', imgStyle, el);
                    img.src = list[key].getIcon().options.iconUrl;
                    i++;
                    el = L.DomUtil.create('td', 'tracker-list', row);
                    el.innerHTML = i.toString() 
                            + (map.track.marker === list[key] ? '*' : '');
                    el = L.DomUtil.create('td', 'tracker-list-id', row);
                    el.innerHTML = key;
                }
                title.innerHTML = 'Found: ' + i;
                map.ui.listPane = this;
 L.DomEvent.disableClickPropagation(pane); 
 L.DomEvent.disableScrollPropagation(pane); 
                return pane;
            },
            onRemove: function(map) {
                delete map.ui.listPane;
                clearInterval(this.options.timer);
            }
        })),
        buttonPaneCtl: new (L.Control.extend({
            options: {position: 'topright',
                buttons: {
// btnMenu: {img: './images/btn_menu.png', onclick: undefined},
                    btnSearch: {
//                        searchCriteria: '', searchList: [],
                        img: './images/btn_search.png',
                        onclick: function(map) {
                            return (function(e) {
                                var frm = this.getElementsByClassName('tracker-search')[0];
// var _this = map.ui.buttonPane.options.buttons.btnSearch                                           
                                if (!frm) {
                                    frm = L.DomUtil.create('form', 'tracker-search');
                                    var inp = L.DomUtil.create('input', 'tracker-search', frm);
                                    inp.type = 'text';
                                    inp.name = 'searchCriteria';
// inp.value = _this.searchCriteria;
                                    frm.onsubmit = function() {
                                        try {
                                            map.searchList = map.searchMarkersById(this.searchCriteria.value);
// _this.searchList =  map.searchMarkersById(this.searchCriteria.value);                                          
                                            if (Object.keys(map.searchList).length !== 0) {
// _this.searchCriteria =  this.searchCriteria.value;                                               
                                                map.ui.listPaneCtl.addTo(map);
                                            } else {
                                                map.ui.consolePane.log('Nothing found');
                                            }
                                        } catch (e) {
                                            console.log(e.message);
                                        }
                                        this.parentElement.removeChild(frm);
                                        return false; // disable submit
                                    };
                                    this.insertBefore(frm, e.target);
//                                    var inp = this.getElementsByClassName('tracker-search')[1];
                                    inp.focus();
                                    inp.scrollIntoView();
                                } else {
                                    if (e.target !== frm.searchCriteria)
                                        frm.onsubmit(frm); //dispatchEvent(new Event('submit'));
                                }
                            });
                        }},
                    btnAccuracy: {
                        img: './images/btn_accuracy.png',
                        onclick: function(map) {
                            return (function(e) {
                                this.childNodes[1].hidden = !map.toggleAccuracy();
                            });
                        },
                        checked: true},
                    btnBound: {
                        img: './images/btn_bound.png',
                        onclick: function(map) {
                            return (function(e) {
                                map.boundMarkers();
                            });
                        }},
                    btnLocate: {
                        img: './images/btn_locate.png',
                        onclick: function(map) {
                            return (function(e) {
                                map.locateOwn();
                            });
                        }}
                }
            },
            onAdd: function(map) {
                var pane = L.DomUtil.create('div', 'tracker-buttons-pane')
                        , div, btn, chk;
                for (var key in this.options.buttons) {
                    div = L.DomUtil.create('div', 'tracker-button', pane);
                    btn = L.DomUtil.create('img', 'tracker-button', div);
                    btn.src = this.options.buttons[key].img;
                    if (this.options.buttons[key].onclick)
                        div.onclick = this.options.buttons[key].onclick(map);
                    if ('checked' in this.options.buttons[key]) {
                        chk = L.DomUtil.create('img', 'tracker-button-checker', div);
                        chk.src = './images/btn_checker.png';
                        chk.hidden = !this.options.buttons[key].checked;
                    }
                }
                map.ui.buttonPane = this;
 L.DomEvent.disableClickPropagation(pane); 
 L.DomEvent.disableScrollPropagation(pane); 
                return pane;
            },
            onRemove: function(map) {
                delete map.ui.buttonPane;
            }
        })),
        addTo: function(map) {
            this.buttonPaneCtl.addTo(map);
            this.consolePaneCtl.addTo(map);
            map.ui.infoPaneCtl = this.infoPaneCtl;
            map.ui.listPaneCtl = this.listPaneCtl;
            return map;
        }
    };
    T.demo = {
        isRunning: false,
        demos: [],
// http://stackoverflow.com/questions/1527803/generating-random-whole-numbers-in-javascript-in-a-specific-range
        randInt: function(minInt, maxInt) {
            if (minInt === maxInt)
                return minInt;
            return Math.floor((Math.random() * (maxInt - minInt + 1)) + minInt);
        },
        randDbl: function(minDbl, maxDbl) {
            if (minDbl === maxDbl)
                return minDbl;
            return (Math.random() * (maxDbl - minDbl)) + minDbl;
        },
// http://www.movable-type.co.uk/scripts/latlong.html
        radialDistance: function(latlng, heading, distance) {
            var R = 6371010; // Earth radius m 6378140?
            var d = distance; // distance m
            var RpD = Math.PI / 180; // radians per degree
            var brng = (heading % 360) * RpD; // degree heading to radiant 
            var φ1 = latlng.lat * RpD; // latitude to radiant
            var λ1 = latlng.lng * RpD; // longitude to radiant
            var φ2 = Math.asin((Math.sin(φ1) * Math.cos(d / R)) +
                    (Math.cos(φ1) * Math.sin(d / R) * Math.cos(brng)));
            var λ2 = λ1 + Math.atan2(Math.sin(brng) * Math.sin(d / R) * Math.cos(φ1),
                    Math.cos(d / R) - Math.sin(φ1) * Math.sin(φ2));
            return {lat: φ2 / RpD, lng: ((λ2 / RpD) + 540) % 360 - 180};
//???? heading - latitude
        },
        moveRandom: function(p) {
            p.heading = (this.randInt(p.heading - 45, p.heading + 45) + 360) % 360;
            var dst = this.randDbl(10, 50);
            p.latlng = this.radialDistance(p.latlng, p.heading, dst);
            p.speed = dst / ((Date.now() - p.timestamp) / 1000); //meters per second
            p.accuracy = this.randDbl(5, 50); //radius!
            p.timestamp = Date.now();
            return p;
        },
        sendAllDemos: function() {
            for (var i = 0; i < this.demos.length; i++) {
                this.sendDemo(this.moveRandom(this.demos[i]));
            }
        },
        sendDemo: function(d) {
            T.onJSONmessage(JSON.stringify(d));
        },
        start: function(delay, latlng) { // milliseconds, initial position
            if (this.isRunning)
                return;
            this.isRunning = true;
            for (var i = 0; i < 5; i++) {
                var p = new T.Location();
                p.action = 'location';
                p.id = 'Demo ' + (i + 1);
                p.timeout = delay;
                p.latlng = latlng ? latlng : L.latLng(51.505, -0.09);
                p.heading = this.randInt(0, 360);
                this.demos[i] = this.moveRandom(p);
            }
            this.sendAllDemos();
            this.timer = setInterval(function(d) {
                d.sendAllDemos();
            }, delay, this); //!IE9
            T.onJSONmessage(JSON.stringify({action: 'message', message: 'DEMO started'}));
        },
        stop: function() {
            if (this.timer)
                clearTimeout(this.timer);
        }
    };
}(window, document));
