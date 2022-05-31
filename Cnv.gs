class _Convert {
  constructor({ gtb }) {
    // gotenberg handle
    this.gtb = gtb
    this.supported = [
      'gtb'
    ]
  }
  exec({ convertTo = 'pdf', blob }) {
    const mimeType = blob.getContentType()
    const blobName = blob.getName()
    const conversion = KnownContentTypes.types.getConversion(mimeType, convertTo)

    // don't know how to convert
    if (conversion.error) {
      conversion.error += `(${mimeType} from ${blobName})`
      return Utils.makeThrow(conversion)
    }
    if (this.supported.indexOf(conversion.data.how) === -1) {
      conversion.error = `Dont know how to do a ${conversion.data.how} conversion (${mimeType} from ${blobName})`
      return Utils.makeThrow(conversion)
    }

    // now we're good to go
    // use gotenberg to convert
    if (conversion.data.how === 'gtb') {
      return  this.gtb.convert({ blob })
    }

  }
}


