// Copyright 2017 The Chromium Authors. All
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview using private properties isn't a Closure violation in tests.
 * @suppress {accessControls}
 */

ApplicationTestRunner.dumpCacheTree = async function() {
  UI.panels.resources._sidebar.cacheStorageListTreeElement.expand();
  var promise = TestRunner.addSnifferPromise(SDK.ServiceWorkerCacheModel.prototype, '_updateCacheNames');
  UI.panels.resources._sidebar.cacheStorageListTreeElement._refreshCaches();
  await promise;
  await ApplicationTestRunner.dumpCacheTreeNoRefresh();
};

ApplicationTestRunner.dumpCacheTreeNoRefresh = async function() {
  UI.panels.resources._sidebar.cacheStorageListTreeElement.expand();
  TestRunner.addResult('Dumping CacheStorage tree:');
  var cachesTreeElement = UI.panels.resources._sidebar.cacheStorageListTreeElement;

  if (!cachesTreeElement.childCount()) {
    TestRunner.addResult('    (empty)');
    return;
  }

  for (var i = 0; i < cachesTreeElement.childCount(); ++i) {
    var cacheTreeElement = cachesTreeElement.childAt(i);
    TestRunner.addResult('    cache: ' + cacheTreeElement.title);
    var view = cacheTreeElement._view;
    promise = TestRunner.addSnifferPromise(Resources.ServiceWorkerCacheView.prototype, '_updateDataCallback');

    if (!view)
      cacheTreeElement.onselect(false);
    else
      view._updateData(true);

    view = cacheTreeElement._view;
    await promise;

    if (view._entriesForTest.length === 0) {
      TestRunner.addResult('        (cache empty)');
      continue;
    }

    var dataGrid = view._dataGrid;

    for (var node of dataGrid.rootNode().children) {
      var children = Array.from(node.element().children).filter(function(element) {
        return !element.classList.contains('responseTime-column');
      });

      var entries = Array.from(children, td => td.textContent).filter(text => text);
      TestRunner.addResult('        ' + entries.join(', '));
    }
  }
};

ApplicationTestRunner.deleteCacheFromInspector = async function(cacheName, optionalEntry) {
  UI.panels.resources._sidebar.cacheStorageListTreeElement.expand();

  if (optionalEntry)
    TestRunner.addResult('Deleting CacheStorage entry ' + optionalEntry + ' in cache ' + cacheName);
  else
    TestRunner.addResult('Deleting CacheStorage cache ' + cacheName);

  var cachesTreeElement = UI.panels.resources._sidebar.cacheStorageListTreeElement;
  var promise = TestRunner.addSnifferPromise(SDK.ServiceWorkerCacheModel.prototype, '_updateCacheNames');
  UI.panels.resources._sidebar.cacheStorageListTreeElement._refreshCaches();
  await promise;

  if (!cachesTreeElement.childCount())
    throw 'Error: Could not find CacheStorage cache ' + cacheName;


  for (var i = 0; i < cachesTreeElement.childCount(); i++) {
    var cacheTreeElement = cachesTreeElement.childAt(i);
    var title = cacheTreeElement.title;
    var elementCacheName = title.substring(0, title.lastIndexOf(' - '));

    if (elementCacheName !== cacheName)
      continue;

    if (!optionalEntry) {
      promise = TestRunner.addSnifferPromise(SDK.ServiceWorkerCacheModel.prototype, '_cacheRemoved');
      cacheTreeElement._clearCache();
      await promise;
      return;
    }

    promise = TestRunner.addSnifferPromise(Resources.ServiceWorkerCacheView.prototype, '_updateDataCallback');
    var view = cacheTreeElement._view;

    if (!view)
      cacheTreeElement.onselect(false);
    else
      view._updateData(true);

    view = cacheTreeElement._view;
    await promise;
    var entry = view._entriesForTest.find(entry => entry.requestURL === optionalEntry);

    if (!entry)
      throw 'Error: Could not find cache entry to delete: ' + optionalEntry;

    await view._model.deleteCacheEntry(view._cache, entry.requestURL);
    return;
  }

  throw 'Error: Could not find CacheStorage cache ' + cacheName;
};

ApplicationTestRunner.waitForCacheRefresh = function(callback) {
  TestRunner.addSniffer(SDK.ServiceWorkerCacheModel.prototype, '_updateCacheNames', callback, false);
};

ApplicationTestRunner.createCache = function(cacheName) {
  return TestRunner.callFunctionInPageAsync('createCache', [cacheName]);
};

ApplicationTestRunner.addCacheEntry = function(cacheName, requestUrl, responseText) {
  return TestRunner.callFunctionInPageAsync('addCacheEntry', [cacheName, requestUrl, responseText]);
};

ApplicationTestRunner.deleteCache = function(cacheName) {
  return TestRunner.callFunctionInPageAsync('deleteCache', [cacheName]);
};

ApplicationTestRunner.deleteCacheEntry = function(cacheName, requestUrl) {
  return TestRunner.callFunctionInPageAsync('deleteCacheEntry', [cacheName, requestUrl]);
};

ApplicationTestRunner.clearAllCaches = function() {
  return TestRunner.callFunctionInPageAsync('clearAllCaches');
};

TestRunner.initAsync(`
  function onCacheStorageError(e) {
    console.error('CacheStorage error: ' + e);
  }

  function createCache(cacheName) {
    return caches.open(cacheName).catch(onCacheStorageError);
  }

  function addCacheEntry(cacheName, requestUrl, responseText) {
    return caches.open(cacheName).then(function(cache) {
      var request = new Request(requestUrl);
      var myBlob = new Blob();

      var init = {
        'status': 200,
        'statusText': responseText
      };

      var response = new Response(myBlob, init);
      return cache.put(request, response);
    }).catch(onCacheStorageError);
  }

  function deleteCache(cacheName) {
    return caches.delete(cacheName).then(function(success) {
      if (!success)
        onCacheStorageError('Could not find cache ' + cacheName);
    }).catch(onCacheStorageError);
  }

  function deleteCacheEntry(cacheName, requestUrl) {
    return caches.open(cacheName).then(cache => cache.delete(new Request(requestUrl))).catch(onCacheStorageError);
  }

  function clearAllCaches() {
    return caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))).catch(onCacheStorageError.bind(this, undefined));
  }
`);
