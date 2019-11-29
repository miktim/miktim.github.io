/* 
 * LiteRadar tracker rev 191104
 * (c) 2019 miktim@mail.ru CC-BY-SA
 * leaflet 1.0.1+ required
 */

(function(window, document) {
    T = {
        version: '0.0.1',
        isSmallScreen: (screen.width > 500) ? false : true,
        options: {
            mode: '', // [watch], nowatch, demo
            ws: '', // websocket address
            minDistance: 30 // meters (minimal track segment length)
        },
        watchOptions: {
            timeout: 180000, // ms
            maximumAge: 30000, // ms
            enableHighAccuracy: true
        },
        locale: {
            itsmeId: "It's me."
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
        this.update(T.options, opt); // mode,ws
        if ('watch' in opt) {
            var val = (opt.watch + '::').split(':');
            if (parseInt(val[0]))
                this.watchOptions.timeout = parseInt(val[0]) * 1000;
            if (parseInt(val[1]))
                this.watchOptions.maximumAge = parseInt(val[1]) * 1000;
            if (val[2] === 't')
                this.watchOptions.enableHighAccuracy = true;
            if (val[2] === 'f')
                this.watchOptions.enableHighAccuracy = false;
        }
        if ('track' in opt && parseInt(opt.track)) {
            this.options.minDistance = parseInt(opt.track);
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
    T.Location = function() {
        this.id = ''; // unique source id (string)
        this.itsme = false; // is own location
        this.latlng = undefined; // {lat, lng} WGS84
        this.accuracy = NaN; // meters (radius)
        this.speed = NaN; // meters per second
        this.altitude = NaN; // meters
        this.heading = NaN; // degrees counting clockwise from true North
        this.timestamp = NaN; // acquired time in milliseconds
        this.timeout = NaN; // lifetime in milliseconds?
    };
    T.onLocationFound = function(l) {
        var loc = new T.Location();
        T.update(loc, T.latLng(l.coords));
        loc.id = T.locale.itsmeId;
        loc.itsme = true;
        loc.timestamp = l.timestamp;
        loc.timeout = T.watchOptions.timeout;
        T.onLocation(loc);
    };
    T.onLocationError = function(e) {
        e.message = 'Geolocation: ' + e.message;
        console.log(e.message);
        T.map.consolePane.log(e.message);
    };
// https://w3c.github.io/geolocation-api/
// leaflet.src.js section Geolocation methods
    T.watchId;
    T.watchLocation = function(onLocationFound, onLocationError, options) {
        if (!('geolocation' in navigator)) {
            onLocationError({
                code: 0,
                message: 'Geolocaton: not supported.'
            });
            return;
        }
        if (T.watchId)
            T.stopLocationWatch();
        this.watchId = navigator.geolocation.watchPosition(
                onLocationFound, onLocationError, options);
        /*
         navigator.geolocation.getCurrentPosition(
         onLocationFound, onLocationError, options);
         T.watchId = setInterval(function() {
         navigator.geolocation.getCurrentPosition(
         onLocationFound, onLocationError, options);
         }, options.maximumAge);
         */
    };
    T.stopLocationWatch = function() {
        if (T.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
//            clearTimeout(T.watchId);
            T.watchId = undefined;
        }
    };
    T.onLocation = function(loc) {
        if (!this.map.isLoaded && this.locations.length === 0)
            this.map.setView(loc.latlng, this.map.options.zoom);
        if (!this.locations[loc.id]) {
            this.locations[loc.id] = loc;
        }
        this.map.setMarker(loc);
    };
    T.onMessage = function(m) {
        var obj = JSON.parse(m);
        if (obj.action === "location") {
            this.onLocation(obj);
        }
    };
    T.checkWebSocket = function() {
        if (this.options.ws) {
            var wsurl = (window.location.protocol === 'https:' ?
                    'wss://' : 'ws://') + this.options.ws;
//            var wsurl = 'wss://' + this.search.ws;
            try {
                T.webSocket = new WebSocket(wsurl);
                T.webSocket.onmessage = T.onMessage;
                T.webSocket.onopen = function(e) {
                    T.sendMessage = function(m) {
                        T.webSocket.send(m);
                    };
                    console.log('WebSocket open');
                };
                T.webSocket.onclose = function(e) {
                    console.log("WebSocket close");
                };
                T.webSocket.onerror = function(e) {
                    T.map.consolePane.log(e.message);
                    console.log(e.message);
                };
            } catch (e) {
                console.log(e.message);
            }
        }
    };
    T.testMode = function(mode) {
        return ((new RegExp('(^|,)' + mode + '(,|$)', 'i')).test(this.options.mode));
    };
    T.checkWatchMode = function() {
        if (!this.testMode('nowatch')) {
            this.watchLocation(
                    T.onLocationFound,
                    T.onLocationError,
                    T.watchOptions);
            if ('getWakeLock' in navigator) {
                navigator.getWakeLock("system").then(function(wakeLock) {
                    T.wakeLockRequest = wakeLock.createRequest();
                });
            } else {
                T.map.consolePane.log('WakeLock not allowed');
            }
        }
    };
    T.checkDemoMode = function(latlng) {
        if (this.testMode('demo'))
            this.demo.run(5000, latlng);
    };
    T.expirationTimer;
    T.checkExpiredLocations = function() {
        if (!this.expirationTimer) {
            this.expirationTimer = setInterval(function() {
                for (var id in T.locations) {
                    if (T.locations[id].timestamp + T.locations[id].timeout < Date.now())
                        T.map.setMarkerOpacity(T.locations[id], 0.4);
                }
            }, Math.max(60000, T.watchOptions.timeout));
        }
    };
    T.run = function(opts, mapId, latlng) {
        this.parseOptions(opts);
        this.map = this._map(mapId).load(latlng);
        this.checkWebSocket();
        this.checkWatchMode();
        this.checkExpiredLocations();
    };
    T._map = function(mapId, latlng) {
        var map = L.map(mapId, {
            minZoom: 5,
            zoom: 17,
            zoomControl: false
        });
        L.tileLayer(window.location.protocol + '//{s}.tile.osm.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        T.UI.addTo(map);
        map.isLoaded = false;
        map.accuracyLayer = L.featureGroup(); // markers accuracy
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
        map.boundMarkers = function() {
            var latLngs = [];
            for (var m in this.markers) {
                latLngs.push(this.markers[m].getLatLng());
            }
            if (latLngs.length > 0) {
                var bounds = L.latLngBounds(latLngs);
                this.fitBounds(bounds);
                this.setView(bounds.getCenter());
            }
        };
        map.track = {
            marker: undefined,
            pathLayer: undefined, // polyline
            accuracyLayer: L.featureGroup(), // track nodes accuracy
            pathLength: 0,
            lastLocation: undefined,
            rubberThread: undefined
        };
        map.track.init = function(map) {
            if (map.hasLayer(this.accuracyLayer)) {
                map.removeLayer(this.accuracyLayer);
            }
            if (map.hasLayer(this.pathLayer)) {
                map.removeLayer(this.pathLayer);
            }
            this.pathLayer = L.polyline([], {weight: 2, color: "red"}).addTo(map);
            this.accuracyLayer = L.featureGroup();
            if (map.showAccuracy)
                map.addLayer(this.accuracyLayer);
            this.pathLength = 0;
            this.lastLocation = undefined;
        };
        map.onMarkerClick = function(e) {
            var id = e.target.options.alt;
            var marker = this.markers[id];
            if (this.track.marker === marker) {
                this.track.marker = undefined;
                if (this.infoPane)
                    this.infoPane.remove(); // removeFrom(this); //0.7.0
            } else {
                this.track.init(this);
                this.track.started = marker.location.timestamp;
                if (!this.infoPane)
                    T.UI.infoPane.addTo(this);
                this.track.marker = marker;
                this.trackMarker(marker);
            }
        };
        map.trackMarker = function(marker) {
            if (this.track.marker === marker) {
                var pos = marker.getLatLng();
                var dst = 0;
                var step = T.options.minDistance;
                if (this.track.lastLocation) {
// flat distance() leaflet 1.0.1+                  
                    dst = this.distance(pos, this.track.lastLocation.latlng);
                    step = Math.max(T.options.minDistance,
                            T.options.minDistance * marker.location.speed);
                }
                if (!this.track.lastLocation || dst >= step) {
// ???check location 'jump' (dead zone?)
                    this.track.lastLocation = marker.location;
                    this.track.pathLayer.addLatLng(pos);
                    L.circle(pos, marker.accuracyCircle.getRadius(),
                            {weight: 1, color: "blue"}).addTo(this.track.accuracyLayer);
                    this.track.pathLength += dst;
                } else {
//                    if(this.track.rubberThread) this.track.rubberThread.removeFrom()
                }
                this.setView(pos, this.getZoom());
                this.infoPane.update({
                    id: marker.location.id,
                    trackLength: this.track.pathLength,
                    trackTime: marker.location.timestamp - this.track.started,
                    movement: dst,
                    timestamp: marker.location.timestamp,
                    speed: marker.location.speed,
                    altitude: marker.location.altitude,
                    heading: marker.location.heading,
                    accuracy: marker.location.accuracy
                });
            }
        };
        map.setMarkerOpacity = function(loc, opacity) {
            var marker = this.markers[loc.id];
            if (marker)
                marker.setOpacity(opacity);
        };
        map.setMarker = function(loc, icon) {
            icon = icon || (loc.itsme ? T.icons.own : T.icons.active);
            var marker = this.markers[loc.id];
            if (!marker) {
                marker = L.marker(loc.latlng, {icon: icon, alt: loc.id});
                marker.on('click', function(e) {
                    map.onMarkerClick(e);
                });
                marker.addTo(this);
                marker.accuracyCircle = L.circle(loc.latlng, loc.accuracy,
                        {weight: 1, color: "blue"}).addTo(this.accuracyLayer);
                this.markers[loc.id] = marker;
            } else {
                marker.setLatLng(loc.latlng);
                marker.accuracyCircle.setLatLng(loc.latlng);
                marker.accuracyCircle.setRadius(loc.accuracy);
                marker.setOpacity(1);
                this.trackMarker(marker);
            }
            marker.location = loc;
            return marker;
        };
        map.load = function(latlng) {
            this.on('load', function(e) {
                map.isLoaded = true;
            });
            this.on('locationfound', function(e) {
                map.consolePane.log();
                map.setView(e.latlng, this.options.zoom);
                T.checkDemoMode(e.latlng);
            });
            this.on('locationerror', function(e) {
                T.checkDemoMode();
                this.consolePane.log(e.message);
                console.log(e.message);
            });
            this.locateOwn(latlng);
            return this;
        };
        map.locateOwn = function(latlng) {
            if (latlng)
                this.setView(latlng, this.options.zoom);
            else {
                this.consolePane.log('Expect location...', 240000);
                this.locate({setView: false}); // no load event
            }
            return this;
        };
        return map;
    };
    T.UI = {
        infoPane: new (L.Control.extend({
            options: {
                position: 'bottomleft',
                infoData: {id: {nick: 'Track ', unit: ':'},
                    trackLength: {nick: 'DST', unit: 'm'},
                    trackTime: {nick: 'TTM', unit: ''},
                    timestamp: {nick: 'TME', unit: ''},
                    speed: {nick: 'SPD', unit: 'm/sec'},
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
                    var pane = map.infoPane.getContainer();
                    if (!pane.style.marginLeft) {
                        pane.style.marginLeft = '-120px';
                    } else {
                        pane.style.marginLeft = "";
                    }
                };
                el = L.DomUtil.create('div', 'tracker-info-header', pane);
                this.options.infoData.id.element = el;
                tbl = L.DomUtil.create('table', 'tracker-info-table', pane);
                el = L.DomUtil.create('div', 'tracker-info-header', pane);
                el.innerHTML = 'Location:';
                tbl1 = L.DomUtil.create('table', 'tracker-info-table', pane);
                for (var key in this.options.infoData) {
                    if (key === 'id')
                        continue;
                    if (key === 'timestamp')
                        tbl = tbl1;
                    row = L.DomUtil.create('tr', 'tracker-info-row', tbl);
                    el = L.DomUtil.create('td', 'tracker-info-nick', row);
                    el.innerHTML = this.options.infoData[key].nick;
                    el = L.DomUtil.create('td', 'tracker-info-value', row);
                    this.options.infoData[key].element = el;
                }

                map.infoPane = this;
                return pane;
            },
            onRemove: function(map) {
                delete map.infoPane;
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
        consolePane: new (L.Control.extend({
            options: {position: 'bottomright', element: undefined},
            onAdd: function(map) {
                var pane = L.DomUtil.create('div', 'tracker-pane');
                this.options.element = pane;
                L.DomUtil.create('div', 'tracker-console-message', pane);
                pane.hidden = true;
                map.consolePane = this;
                return pane;
            },
            onRemove: function(map) {
                delete map.consolePane;
            },
            log: function(m, timeout) {
                if (m) {
                    this.options.element.childNodes[0].innerHTML =
                            (new Date()).toTimeString().substring(0, 8)
                            + ' ' + m;
                    this.options.element.hidden = false;
                    timeout = timeout ? timeout : 10000;
                    this.options.timer = setTimeout(function(e) {
                        e.hidden = true;
                    }, timeout, this.options.element);
                } else {
                    this.options.element.hidden = true;
                }
            }
        })),
        controlPane: new (L.Control.extend({
            options: {position: 'topright',
                buttons: {
// btnMenu: {img: './images/btn_menu.png', onclick: undefined},
                    btnFind: {
                        img: './images/btn_find.png',
                        onclick: function(map) {
                            return (function(e) {
                                map.boundMarkers();
                            });
                        }},
                    btnAccuracy: {
                        img: './images/btn_accuracy.png',
                        onclick: function(map) {
                            return (function(e) {
                                e.target.parentElement.childNodes[1].hidden = !map.toggleAccuracy();
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
                        btn.onclick = this.options.buttons[key].onclick(map);
                    if ('checked' in this.options.buttons[key]) {
                        chk = L.DomUtil.create('img', 'tracker-button-checker', div);
                        chk.src = './images/btn_checker.png';
                        chk.hidden = !this.options.buttons[key].checked;
                    }
                }
                return pane;
            },
            onRemove: function(map) {

            }
        })),
        findPane: new (L.Control.extend({
            options: {position: 'topright',
                element: undefined,
            },
            onAdd: function(map) {
                var pane = L.DomUtil.create('div', 'tracker-find-pane')
                        , div, btn, fld;
                this.options.element = pane;
                div = L.DomUtil.create('input', 'tracker-find-field', pane);
                map.findPane = this;
                return pane;
            },
            onRemove: function(map) {
                delete map.findPane;
            }
        })),
        addTo: function(map) {
            this.consolePane.addTo(map);
            this.controlPane.addTo(map);
            this.findPane.addTo(map);
        }
    };

    window.addEventListener("unload", function() {
        if (T.watchId)
            T.stopLocationWatch();
        if ('webSocket' in T)
            T.webSocket.close();
    });

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
//???? latitude
        },
        moveRandom: function(p) {
            p.heading = this.randDbl(0, 180);
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
            T.onMessage(JSON.stringify(d));
        },
        run: function(delay, latlng) { // milliseconds, initial position
            if (this.isRunning)
                return;
            this.isRunning = true;
            for (var i = 0; i < 5; i++) {
                var p = new T.Location();
                p.action = 'location';
                p.id = 'Demo ' + (i + 1);
                p.timeout = delay;
                p.latlng = latlng ? latlng : L.latLng(51.505, -0.09);
                this.demos[i] = this.moveRandom(p);
            }
            this.sendAllDemos();
            setInterval(function(d) {
                d.sendAllDemos();
            }, delay, this); //!IE9
        }
    };
}(window, document));
