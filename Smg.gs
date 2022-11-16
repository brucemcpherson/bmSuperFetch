
/**
 * @typedef SmgApiOptions
 * @property {_SuperFetch} superFetch a superfetch instance
 * @property {boolean} noCache whether to cache
 * @property {boolean} stale whether to use stale cache processing
 * @property {string} staleKey key to use to get stale value
 * @property {boolean} showUrl whether to showUrls when fetching
 * @property {object[]} extraParams always add these params
 * @property {string} projectId the project id
 */

/**
 * @typedef SmgResult
 * first 2 props are a ValuePack
 * @property {*} value depends on valueType
 * @property {string} valueType string|array|boolean|number|object|blob|byteArray|null
 * @property {string} name full name fo secret/version
 * @property {string} version for handiness
 */


/**
 * https://cloud.google.com/secret-manager/docs/configuring-secret-manager
 * 1. enable secrets manager api in cloud console
 * 2. in IAM add secrets manager admin to your user - or accessor for readonly
 * 
 */
class _SmgApi {
  /**
   * @param {SmgApiOptions} params
   * @return {_SmgApi}
   */
  constructor({
    superFetch,
    staleKey = 'smg',
    stale = true,
    noCache = false,
    showUrl = false,
    extraParams = [],
    projectId,
    replication = { automatic: {} }
  } = {}) {
    this.projectId = projectId
    // get a new instance of superfetch
    // replicating the settings, but adding whether to use stale/staleKey
    this.superFetch = superFetch.ref({
      stale,
      staleKey
    })
    this.extraParams = Utils.arrify(extraParams)
    this.noCache = noCache
    this.showUrl = showUrl
    this.endPoint = `https://secretmanager.googleapis.com/v1/projects/${this.projectId}`
    this.replication = { replication }
    this.proxy = this.superFetch.proxy({
      endPoint: this.endPoint,
      noCache,
      showUrl
    })
    this.valuePacker = new _ValuePacker()
    this.maxChunk = 1000
  }

  /**
   * create a new ref - which is just another instance of the class with a different base
   * @param {string} base a new base 
   * @param {DrvApiOptions}
   * @return {_SmgApi}
   */
  ref({
    superFetch = this.superFetch,
    stale = this.stale,
    staleKey = this.staleKey,
    noCache = this.noCache,
    showUrl = false,
    extraParams = this.extraParams,
    projectId = this.projectId,
    replication = this.replication.replication
  } = {}) {
    return new _SmgApi({
      superFetch,
      noCache,
      showUrl,
      extraParams,
      projectId,
      replication,
      stale,
      staleKey
    })
  }

  /**
   * this is used to invalidate all cache entries
   * subscribing to this.staleKey
   * and should be issued after write operations
   */
  makeStale() {
    return this.isCaching ? this.superFetch.makeStale() : null
  }
  get isCaching() {
    return this.superFetch.cacher.cacheable && !this.noCache
  }

  get _helpers() {
    const path = '/secrets'
    const self = this
    /**
     * how to post
     * @param {string} [id] the secret id
     * @param {string} data the ValuePack as base64
     * @param {string} path the path
     */
    const _poster = ({ id, data, path, method = "POST" }, ...params) => {
      // invalidate cache for the api
      this.makeStale()
      const payload = JSON.stringify(data)
      return self.proxy(path + Utils.addParams(params.concat(id ? [{ secretId: id }] : []).concat(self.extraParams)), {
        payload,
        contentType: 'application/json',
        method
      })
    }
    /**
     * how to get
     * @param {string} id the secret id
     * @param {string} path the path
     */
    const _getter = ({ path }, ...params) => {
      //return self.proxy(path + Utils.addParams(params.concat(id ? [{ secretId: id }] : []).concat(self.extraParams)), {
      return self.proxy(path + Utils.addParams(params.concat(self.extraParams)), {
        contentType: 'application/json',
        method: "GET"
      })
    }

    /**
     * how to delete
     * @param {string} id the secret id
     */
    const _deleter = ({ id }, ...params) => {
      self.makeStale()
      return self.proxy(_makeSecretPath({ id }) + Utils.addParams(params.concat(self.extraParams)), {
        contentType: 'application/json',
        method: "DELETE"
      })
    }

    const _destroyer = ({ id, version }, ...params) => {
      self.makeStale()
      if (!version) return Utils.makeThrow({
        error: 'must specify a version number to delete - "latest" is not valid with this method'
      })
      return self.proxy(_makeVersionPath({
        id,
        version,
        extra: ":destroy"
      }) + Utils.addParams(params.concat(self.extraParams)), {
        contentType: 'application/json',
        method: "POST"
      })
    }

    const _makeSecretPath = ({ id, extra = '' }) => path + `/${id}${extra}`

    const _makeVersionPath = ({ id, version, extra = ":access" }) => _makeSecretPath({
      id,
      extra: `/versions/${version}${extra}`
    })

    const _getVersion = ({ id, version }, ...params) => {
      const result = _getter({
        path: _makeVersionPath({ id, version })
      }, ...params)
      if (!result.error) {
        result.data = {
          version: result.data.name.replace(/.*\/(.*)$/, "$1"),
          name: result.data.name,
          ...self.valuePacker.unpack(result.data.payload.data)
        }
      }
      return result
    }

    const _getSecret = ({ id }, ...params) => {
      const result = _getter({
        path: _makeSecretPath({ id })
      }, ...params)
      return result
    }

    const _setAliases = ({ id, aliases } = {}, ...params) => {
      const data = { versionAliases: aliases }
      return _poster({
        data,
        method: "PATCH",
        path: _makeSecretPath({ id })
      }, ...params.concat([{ updateMask: "version_aliases" }]))
    }

    const _tokenFinder = (result) => result && result.data && result.data.nextPageToken
    const _finalizer = ({ tank }) => {
      if (!tank.context.error) {
        tank.context.result.data = tank.context.result.data || {}
        tank.context.result.data.items = tank.context.items.splice(0, tank.context.items.length)
      }
      return tank
    }


    const _extractVersion = ({ name }) => parseInt(name.replace(/.*\/versions\/(.*)$/, "$1"), 10)

    return {
      _tokenFinder,
      _finalizer,
      _setAliases,
      _getSecret,
      _getVersion,
      _makeVersionPath,
      _makeSecretPath,
      _destroyer,
      _deleter,
      _getter,
      _poster,
      _extractVersion
    }
  }
  get secretsPath() {
    return "/secrets"
  }

  page({ pageToken, max, pageSize } = {}) {
    return {
      list: ({ query } = {}, ...params) => {
        return this._list({ query, page: { pageToken, max, pageSize } }, ...params)
      }
    }
  }

  list({ query } = {}, ...params) {
    return this._list({ query, page: {} }, ...params)
  }

  _list({ query, page }, ...params) {
    const self = this
    const { _getter, _tokenFinder: tokenFinder, _finalizer: finalizer } = self._helpers

    // the tank functions have access to this to build up the final result
    return Pager.tankingPager({
      getter: ({ page }) => {
        const { pageToken, pageSize } = page
        return _getter({
          path: self.secretsPath
        },
          ...params.concat([{ pageSize }])
            .concat(query ? [{ filter: query }] : [])
            .concat(pageToken ? [{ pageToken }] : []))
      },
      extractor: (data) => {
        return data ? data.secrets.slice() : null
      },
      tokenFinder,
      maxChunk: self.maxChunk,
      page,
      finalizer
    }).start().context.result

  }


  _listVersions({ id, query, page }, ...params) {
    const self = this
    const { _getter, _tokenFinder: tokenFinder, _finalizer: finalizer } = self._helpers

    // the tank functions have access to this to build up the final result
    return Pager.tankingPager({
      getter: ({ page }) => {
        const { pageToken, pageSize } = page
        return _getter({
          path: self._helpers._makeSecretPath({ id, extra: '/versions' })
        },
          ...params.concat([{ pageSize }])
            .concat(query ? [{ filter: query }] : [])
            .concat(pageToken ? [{ pageToken }] : []))
      },
      extractor: (data) => {
        return data ? data.versions.slice() : null
      },
      tokenFinder,
      maxChunk: self.maxChunk,
      page,
      finalizer
    }).start().context.result

  }
  /**
   * .secrets
   */
  secret({ id: pSecretId, version: pVersion } = {}) {
    const path = this.secretsPath
    const self = this
    const {
      _getVersion,
      _makeSecretPath,
      _destroyer,
      _deleter,
      _poster,
      _setAliases
    } = self._helpers

    return {
      /**
       * create a new secret
       * @param {object} params
       * @param {string} [params.id] secret id
       * @param {object} [params.replication] a replication object
       * @param {object} [params.labels] any labels to assign 
       * @return {PackResponse}
       */
      create: ({
        id = pSecretId,
        labels,
        replication,
      } = {}, ...params) => {
        // min is replication
        const data = {
          ...self.replication
        }
        if (replication) data.replication = replication
        if (labels) data.labels = labels
        return _poster({
          id,
          data,
          path
        }, ...params)
      },

      /**
       * patch in versionAliases
       * @param {object} params
       * @param {string} [params.id] secret id
       * @param {*} params.data secret content
       * @param {boolean} params.data.b64 write native
       * @param {object} [params.aliases] any aliases to assign 
       * @param {}
       * @return {PackResponse}
       */
      setAliases: ({ id = pSecretId, aliases }, ...params) => _setAliases({ id, aliases }, ...params),

      /**
       * get version contents
       * @param {object} params
       * @param {string} [params.id] secret id
       * @param {*} params.data secret content
       * @param {boolean} params.data.b64 write native
       * @param {}
       * @return {PackResponse}
       */
      addVersion: ({ id = pSecretId, data, b64 = false } = {}, ...params) => {
        const payload = {
          data: self.valuePacker.pack(data, b64 ? 'b64' : null)
        }
        const meta = _poster({
          data: {
            payload
          },
          path: _makeSecretPath({ id, extra: ":addVersion" })
        }, ...params)

        return meta

      },

      /**
       * doesnt go to the api
       * just returns the secret id of the current closure
       * @return {string} the secretid
       */
      get id() {
        return pSecretId
      },

      /**
       * get secret and selected version contents
       * @param {object} params
       * @param {string} [params.id] secret id
       * @param {string} [params.version="latest"] version
       * @return {PackResponse} the .data piece contains a SmgResult
       */
      get: ({ id = pSecretId, version = pVersion || "latest" } = {}, ...params) => _getVersion({ id, version }, ...params),

      /**
       * remove a secret
       * @param {object} params
       * @param {string} [params.id] secret id
       * @return {PackResponse} 
       */
      delete: ({ id = pSecretId } = {}, ...params) => _deleter({ id }, ...params),

      /**
       * destroy a secret version
       * @param {object} params
       * @param {string} [params.id] secret id
       * @param {string} params.version the version number
       * @return {PackResponse} 
       */
      // destroy a version
      destroy: ({ id = pSecretId, version = pVersion } = {}, ...params) => _destroyer({ id, version }, ...params),

      list({ id = pSecretId, query } = {}, ...params) {
        return self._listVersions({ id, query, page: {} }, ...params)
      },

      page({ pageToken, max, pageSize } = {}) {
        return {
          list({ id = pSecretId, query } = {}, ...params) {
            return self._listVersions({ id, query, page: { pageToken, max, pageSize } }, ...params)
          }
        }
      }

    }
  }





}



