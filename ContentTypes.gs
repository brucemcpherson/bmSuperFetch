const KnownContentTypes = {
  get types() {
    return {
      mimeTypes: Object.keys(this.domains).filter(c => typeof this.domains[c] === 'object').reduce((p, c) => {
        Object.keys(this.domains[c].details).forEach(f => p.push(
          this.domains.getDetail(c, f)
        ))
        return p
      }, []),

      getByMimeType: (mimeType) => {
        return this.types.mimeTypes.find(f => f.mimeType === mimeType)
      },

      getConversion: (mimeType, convertTo) => {
        const from = this.types.getByMimeType(mimeType)
        if (!from) return {
          error: `Unknown conversion mimeType ${mimeType}`
        }

        // check required conversion exists
        const how = from.detail.convertsTo.find(f => f.name === convertTo)
        if (!how) return {
          error: `Conversion from ${from.name} to ${convertTo} not allowed`
        }

        // return the from/to profile
        const to = this.types.mimeTypes.find(f => f.name === convertTo)
        return {
          data: {
            from,
            to,
            how: how.how
          }
        }

      }
    }
  },

  get domains() {
    return {
      get application() {
        return {
          prefix: "application/",
          details: {
            pdf: {
              extension: 'pdf'
            },
            xls: {
              extension: 'xls',
              convertsTo: 'pdf'
            },
            xlsx: {
              extension: 'xlsx',
              convertsTo: ['pdf']
            }
          }
        }
      },
      get image() {
        return {
          prefix: 'image/',
          details: {
            jpeg: {
              extension: 'jpeg',
              convertsTo: [{
                name: 'pdf',
                how: 'gtb'
              }]
            },
            png: {
              extension: 'png',
              convertsTo: ['document']
            }
          }
        }
      },
      get google() {
        return {
          prefix: 'application/vnd.google-apps.',
          details: {
            audio: [],
            document: {
              convertsTo: ['pdf']
            },
            'drive-sdk': [],
            drawing: [],
            file: [],
            folder: [],
            form: [],
            fusiontable: [],
            jam: [],
            map: [],
            photo: [],
            presentation: [],
            script: [],
            shortcut: [],
            site: [],
            spreadsheet: {
              convertsTo: ['pdf']
            },
            unknown: [],
            video: []

          }
        }
      },
      getDetail: (domain, name) => {
        const detail = this.domains[domain].details[name]
        return detail && {
          mimeType: this.domains[domain].prefix + name,
          name,
          detail
        }
      }
    }
  }

}

