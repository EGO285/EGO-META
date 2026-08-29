/*!
 * Appwrite Web SDK — Subset build for EGO-META
 * Compatible API surface: Client, Account, Databases, Storage, Realtime, Query, ID
 * Based on Appwrite SDK v17 public API
 */
(function (global) {
  'use strict';

  /* ── Utilities ─────────────────────────────────────────────────────────── */

  function _uuid() {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function _buildQuery(queries) {
    return queries.map(function(q) {
      if (typeof q === 'string') return q;
      return JSON.stringify(q);
    });
  }

  /* ── Query builder ──────────────────────────────────────────────────────── */

  var Query = {
    equal:        function(attr, val) { return 'equal("'+attr+'",'+JSON.stringify(Array.isArray(val)?val:[val])+')'; },
    notEqual:     function(attr, val) { return 'notEqual("'+attr+'",'+JSON.stringify([val])+')'; },
    lessThan:     function(attr, val) { return 'lessThan("'+attr+'",'+JSON.stringify([val])+')'; },
    lessThanEqual:function(attr, val) { return 'lessThanEqual("'+attr+'",'+JSON.stringify([val])+')'; },
    greaterThan:  function(attr, val) { return 'greaterThan("'+attr+'",'+JSON.stringify([val])+')'; },
    greaterThanEqual: function(attr, val) { return 'greaterThanEqual("'+attr+'",'+JSON.stringify([val])+')'; },
    search:       function(attr, val) { return 'search("'+attr+'",'+JSON.stringify([val])+')'; },
    isNull:       function(attr)      { return 'isNull("'+attr+'")'; },
    isNotNull:    function(attr)      { return 'isNotNull("'+attr+'")'; },
    between:      function(attr, a, b){ return 'between("'+attr+'",'+JSON.stringify([a,b])+')'; },
    contains:     function(attr, val) { return 'contains("'+attr+'",'+JSON.stringify(Array.isArray(val)?val:[val])+')'; },
    or:           function(queries)   { return 'or(['+queries.map(function(q){return '"'+q.replace(/"/g,'\\"')+'"';}).join(',')+'])'; },
    and:          function(queries)   { return 'and(['+queries.map(function(q){return '"'+q.replace(/"/g,'\\"')+'"';}).join(',')+'])'; },
    orderDesc:    function(attr)      { return 'orderDesc("'+attr+'")'; },
    orderAsc:     function(attr)      { return 'orderAsc("'+attr+'")'; },
    cursorAfter:  function(id)        { return 'cursorAfter("'+id+'")'; },
    cursorBefore: function(id)        { return 'cursorBefore("'+id+'")'; },
    limit:        function(n)         { return 'limit('+n+')'; },
    offset:       function(n)         { return 'offset('+n+')'; },
    select:       function(attrs)     { return 'select(['+attrs.map(function(a){return '"'+a+'"';}).join(',')+'])'; },
  };

  /* ── ID helper ──────────────────────────────────────────────────────────── */

  var ID = {
    unique: function() { return _uuid(); },
    custom: function(id) { return id; },
  };

  /* ── HTTP Client ────────────────────────────────────────────────────────── */

  function Client() {
    this._endpoint = 'https://cloud.appwrite.io/v1';
    this._projectId = '';
    this._headers = { 'Content-Type': 'application/json', 'X-Appwrite-Response-Format': '1.4.0' };
    this._jwtToken = null;
  }

  Client.prototype.setEndpoint = function(ep) { this._endpoint = ep.replace(/\/$/, ''); return this; };
  Client.prototype.setProject  = function(id) { this._projectId = id; this._headers['X-Appwrite-Project'] = id; return this; };
  Client.prototype.setJWT      = function(jwt){ this._jwtToken = jwt; return this; };
  Client.prototype.setSelfSigned = function()  { return this; };

  Client.prototype._call = function(method, path, headers, params) {
    var self = this;
    var url = this._endpoint + path;
    var allHeaders = Object.assign({}, this._headers, headers || {});
    if (this._jwtToken) allHeaders['X-Appwrite-JWT'] = this._jwtToken;

    var isGet = (method === 'GET');
    if (isGet && params && Object.keys(params).length) {
      var qs = [];
      for (var k in params) {
        var v = params[k];
        if (Array.isArray(v)) {
          v.forEach(function(item) { qs.push(encodeURIComponent(k+'[]')+'='+encodeURIComponent(item)); });
        } else if (v !== undefined && v !== null) {
          qs.push(encodeURIComponent(k)+'='+encodeURIComponent(v));
        }
      }
      if (qs.length) url += '?' + qs.join('&');
    }

    var opts = { method: method, headers: allHeaders, credentials: 'include' };
    if (!isGet && params !== undefined && params !== null) {
      if (params instanceof FormData) {
        opts.body = params;
        delete allHeaders['Content-Type']; // let browser set multipart boundary
      } else {
        opts.body = JSON.stringify(params);
      }
    }

    return fetch(url, opts).then(function(res) {
      var contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        return (contentType.includes('application/json') ? res.json() : res.text()).then(function(body) {
          var msg = (typeof body === 'object' ? (body.message || JSON.stringify(body)) : body) || res.statusText;
          var err = new Error(msg);
          err.code = res.status;
          err.type = (typeof body === 'object') ? body.type : '';
          err.response = body;
          throw err;
        });
      }
      if (res.status === 204 || contentType === '') return {};
      if (contentType.includes('application/json')) return res.json();
      return res.blob();
    });
  };

  /* ── Account ────────────────────────────────────────────────────────────── */

  function Account(client) { this.client = client; }

  Account.prototype.get = function() {
    return this.client._call('GET', '/account');
  };
  Account.prototype.create = function(userId, email, password, name) {
    return this.client._call('POST', '/account', {}, { userId: userId, email: email, password: password, name: name });
  };
  Account.prototype.createEmailPasswordSession = function(email, password) {
    return this.client._call('POST', '/account/sessions/email', {}, { email: email, password: password });
  };
  Account.prototype.deleteSession = function(sessionId) {
    return this.client._call('DELETE', '/account/sessions/' + sessionId);
  };
  Account.prototype.deleteSessions = function() {
    return this.client._call('DELETE', '/account/sessions');
  };
  Account.prototype.createRecovery = function(email, url) {
    return this.client._call('POST', '/account/recovery', {}, { email: email, url: url });
  };
  Account.prototype.updateRecovery = function(userId, secret, password) {
    return this.client._call('PUT', '/account/recovery', {}, { userId: userId, secret: secret, password: password });
  };
  Account.prototype.updateName = function(name) {
    return this.client._call('PATCH', '/account/name', {}, { name: name });
  };
  Account.prototype.updateEmail = function(email, password) {
    return this.client._call('PATCH', '/account/email', {}, { email: email, password: password });
  };
  Account.prototype.updatePassword = function(password, oldPassword) {
    return this.client._call('PATCH', '/account/password', {}, { password: password, oldPassword: oldPassword });
  };
  Account.prototype.createOAuth2Session = function(provider, success, failure, scopes) {
    var params = { project: this.client._projectId, success: success, failure: failure };
    if (scopes) params.scopes = scopes;
    var qs = Object.keys(params).map(function(k){ return k+'='+encodeURIComponent(params[k]); }).join('&');
    var url = this.client._endpoint + '/account/sessions/oauth2/' + provider + '?' + qs;
    window.location.href = url;
  };
  Account.prototype.getSession = function(sessionId) {
    return this.client._call('GET', '/account/sessions/' + sessionId);
  };
  Account.prototype.listSessions = function() {
    return this.client._call('GET', '/account/sessions');
  };

  /* ── Databases ──────────────────────────────────────────────────────────── */

  function Databases(client) { this.client = client; }

  Databases.prototype.listDocuments = function(databaseId, collectionId, queries) {
    var params = {};
    if (queries && queries.length) params.queries = queries;
    return this.client._call('GET', '/databases/'+databaseId+'/collections/'+collectionId+'/documents', {}, params);
  };
  Databases.prototype.getDocument = function(databaseId, collectionId, documentId, queries) {
    var params = {};
    if (queries && queries.length) params.queries = queries;
    return this.client._call('GET', '/databases/'+databaseId+'/collections/'+collectionId+'/documents/'+documentId, {}, params);
  };
  Databases.prototype.createDocument = function(databaseId, collectionId, documentId, data, permissions) {
    var body = Object.assign({ documentId: documentId }, data);
    if (permissions) body.$permissions = permissions;
    return this.client._call('POST', '/databases/'+databaseId+'/collections/'+collectionId+'/documents', {}, body);
  };
  Databases.prototype.updateDocument = function(databaseId, collectionId, documentId, data, permissions) {
    var body = Object.assign({}, data || {});
    if (permissions) body.$permissions = permissions;
    return this.client._call('PATCH', '/databases/'+databaseId+'/collections/'+collectionId+'/documents/'+documentId, {}, body);
  };
  Databases.prototype.deleteDocument = function(databaseId, collectionId, documentId) {
    return this.client._call('DELETE', '/databases/'+databaseId+'/collections/'+collectionId+'/documents/'+documentId);
  };

  /* ── Storage ────────────────────────────────────────────────────────────── */

  function Storage(client) { this.client = client; }

  Storage.prototype.createFile = function(bucketId, fileId, file, permissions) {
    var fd = new FormData();
    fd.append('fileId', fileId);
    fd.append('file', file);
    if (permissions) permissions.forEach(function(p){ fd.append('permissions[]', p); });
    return this.client._call('POST', '/storage/buckets/'+bucketId+'/files', {}, fd);
  };
  Storage.prototype.getFile = function(bucketId, fileId) {
    return this.client._call('GET', '/storage/buckets/'+bucketId+'/files/'+fileId);
  };
  Storage.prototype.getFileView = function(bucketId, fileId) {
    return this.client._endpoint + '/storage/buckets/'+bucketId+'/files/'+fileId+'/view?project='+this.client._projectId;
  };
  Storage.prototype.getFilePreview = function(bucketId, fileId, width, height) {
    var params = 'project='+this.client._projectId;
    if (width) params += '&width='+width;
    if (height) params += '&height='+height;
    return this.client._endpoint + '/storage/buckets/'+bucketId+'/files/'+fileId+'/preview?'+params;
  };
  Storage.prototype.deleteFile = function(bucketId, fileId) {
    return this.client._call('DELETE', '/storage/buckets/'+bucketId+'/files/'+fileId);
  };

  /* ── Realtime ───────────────────────────────────────────────────────────── */

  function Realtime(client) {
    this.client = client;
    this._subscriptions = {};
    this._subId = 0;
    this._ws = null;
    this._reconnectTimeout = null;
    this._reconnectDelay = 1000;
    this._channels = new Set();
  }

  Realtime.prototype._connect = function() {
    var self = this;
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) return;

    var endpoint = this.client._endpoint.replace(/^http/, 'ws');
    var url = endpoint + '/realtime?project=' + this.client._projectId;
    if (this._channels.size) {
      this._channels.forEach(function(ch){ url += '&channels[]=' + encodeURIComponent(ch); });
    }

    try {
      this._ws = new WebSocket(url);
    } catch(e) { console.warn('EGO-META Realtime: WebSocket init failed', e); return; }

    this._ws.onopen = function() {
      self._reconnectDelay = 1000;
      // subscribe to all channels
      if (self._channels.size) {
        self._ws.send(JSON.stringify({ type: 'subscribe', data: { channels: Array.from(self._channels) } }));
      }
    };

    this._ws.onmessage = function(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type !== 'event') return;
        var events = msg.data.events || [];
        var payload = msg.data.payload || {};
        var channels = msg.data.channels || [];
        // dispatch to matching subscribers
        for (var id in self._subscriptions) {
          var sub = self._subscriptions[id];
          var match = sub.channels.some(function(ch) {
            return channels.some(function(c){ return c === ch || c.startsWith(ch); });
          });
          if (match) {
            try { sub.callback({ events: events, payload: payload, channels: channels, timestamp: msg.data.timestamp }); }
            catch(err) { console.error('EGO-META Realtime callback error', err); }
          }
        }
      } catch(err) { console.warn('EGO-META Realtime: bad message', err); }
    };

    this._ws.onerror = function(e) { console.warn('EGO-META Realtime: WS error', e); };

    this._ws.onclose = function() {
      self._ws = null;
      clearTimeout(self._reconnectTimeout);
      if (Object.keys(self._subscriptions).length > 0) {
        self._reconnectTimeout = setTimeout(function() {
          self._reconnectDelay = Math.min(self._reconnectDelay * 2, 30000);
          self._connect();
        }, self._reconnectDelay);
      }
    };
  };

  Realtime.prototype._resubscribe = function() {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: 'subscribe', data: { channels: Array.from(this._channels) } }));
    } else {
      if (this._ws) { this._ws.close(); this._ws = null; }
      this._connect();
    }
  };

  Realtime.prototype.subscribe = function(channels, callback) {
    var self = this;
    var id = ++this._subId;
    var chList = Array.isArray(channels) ? channels : [channels];
    this._subscriptions[id] = { channels: chList, callback: callback };
    chList.forEach(function(ch){ self._channels.add(ch); });
    this._resubscribe();
    return function() {
      delete self._subscriptions[id];
      // recalc active channels
      self._channels = new Set();
      for (var k in self._subscriptions) {
        self._subscriptions[k].channels.forEach(function(ch){ self._channels.add(ch); });
      }
      self._resubscribe();
    };
  };

  /* ── Permission helpers (Appwrite v17 style) ────────────────────────────── */

  var Permission = {
    read:   function(role){ return 'read("'+role+'")'; },
    write:  function(role){ return 'write("'+role+'")'; },
    create: function(role){ return 'create("'+role+'")'; },
    update: function(role){ return 'update("'+role+'")'; },
    delete: function(role){ return 'delete("'+role+'")'; },
  };

  var Role = {
    any:     function(){ return 'any'; },
    guests:  function(){ return 'guests'; },
    users:   function(){ return 'users'; },
    user:    function(id, status){ return 'user:'+id+(status?'/'+status:''); },
    team:    function(id, role){ return 'team:'+id+(role?'/'+role:''); },
    member:  function(id){ return 'member:'+id; },
    label:   function(name){ return 'label:'+name; },
  };

  /* ── Namespace export ────────────────────────────────────────────────────── */

  var Appwrite = {
    Client:     Client,
    Account:    Account,
    Databases:  Databases,
    Storage:    Storage,
    Realtime:   Realtime,
    Query:      Query,
    ID:         ID,
    Permission: Permission,
    Role:       Role,
  };

  // UMD-style export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Appwrite;
  } else {
    global.Appwrite = Appwrite;
  }

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
