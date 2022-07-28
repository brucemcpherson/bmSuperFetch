const Pager = (() => {


  const cacheDetect = (pluginInstance, { key, page }) => {
    // if we're  even doing cache here and we're not restarting a depage
    // its not ok to have caching turned on if there was an attempt to provide 
    // a pageToken
    
    if (pluginInstance.isCaching) {

      if (!Utils.isUndefined(page.pageToken)) {
        throw 'you attempted to provide a pageToken, but caching is on - try again with eg. drv.ref("",{noCache: true})'
      }

      // pick up cached version
      const cached = pluginInstance.superFetch.cacher.get(key)

      // undo the compression and remake standard shape
      const pack = pluginInstance.superFetch.cacheUnLumper({}, cached)

      if (pluginInstance.showUrl) console.log(key, pack.cached ? 'was cached' : 'was not cached')
      // set page token to null to signal it's not safe
      pack.pageToken = null

      return Utils.makeThrow(pack)
    } else {
      return {}
    }
  }

  // it wasn't in cache, so we neeed a getter
  const getter = (pluginInstance, { pageToken, items, parentId, query, ref, page, params }) => {
    const { pageSize, maxWait } = pluginInstance.optimizePage(pluginInstance.maxChunk, items.length, page)

    const url = pluginInstance.filesPath + Utils.addParams(
      [pluginInstance.makeParentQuery({ parentId, query })]
        .concat(pluginInstance.extraParams)
        .concat([{ pageSize }])
        .concat(params)
        .concat(pageToken ? [{ pageToken }] : [])
    )
    const result = ref.proxy(url)

    const { rateLimit } = result
    // if it's a rate limit error then we might be able to go again
    if (rateLimit && rateLimit.fail) {
      if (rateLimit.waitFor && rateLimit.waitFor < maxWait) {
        console.log(`Hit a rate limit problem on ${url} - waiting for ${rateLimit.waitFor}ms and retrying`)
        Utilities.sleep(rateLimit.waitFor)
        return getter(pageToken, items)
      } else {
        console.log(`Trying to ratelimit wait for ${rateLimit.waitFor} cant wait longer than ${maxWait}`)
      }
    }
    return result
  }

  const localPager = (pluginInstance, { consolidator, tokenFinder, pager, parentId, query, ref, page, params }) => {
    // standard api get
    const result = getter(pluginInstance, {
      pageToken: pager.pageToken,
      items: pager.items,
      parentId,
      query,
      ref,
      page,
      params
    })

    // consoldate into items and expansions
    if (!result.error) {
      if (result.cached) {
        result.error = 'Unexpected cached result in search operation'
      } else {
        // standardized response
        consolidator({ pager, result })
      }
    }

    const ob = {
      ...pager,
      result,
      // important that null is returned for detection of attempt to use pagetoken with cached results
      pageToken: tokenFinder({ result }) || null
    }

    return ob
  }

  return {
    localPager,
    cacheDetect,
    getter
  }

})()