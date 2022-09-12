
/**
 * valuepacker is all about taking any input and packing it as base64
 * and unpacking afterwards to its original state
 */
/**
 * @typedef ValuePack
 * @property {string} [name] present if valuetype is a blob
 * @property {string} [contentType] present if valueType is blob
 * @property {*} value depends on the valueType
 * @property {string} valueType string|array|boolean|number|object|blob|byteArray|null
 */
/**
 * @typedef ValueUnpack
 * @property {*} value depends on valueType
 * @property {string} valueType string|array|boolean|number|object|blob|byteArray|null
 */
class _ValuePacker {

  constructor() {
  }

  decode(base64) {
    return Utilities.newBlob(Utils.fromb64(base64))
  }

  encode(item) {
    return Utils.tob64(Utilities.newBlob(item).getBytes())
  }

  /**
   * @param {*} item anything
   * @return {string} its a ValuePack in base64 or just a b64 conversion
   */
  pack(item, forceType) {
    return Utils.tob64(forceType === 'b64' ? item : JSON.stringify(this.pack64(item)))
  }

  /**
   * @param {*} item anything
   * @return {ValuePack}
   */
  pack64(item) {
    // detect type
    const valueType =  Utils.whichType(item)
    if (!valueType) throw `unsupported item type ${typeof item}`


    if (valueType === "blob") {
      return {
        isSuperFetch: true,
        name: item.getName(),
        contentType: item.getContentType(),
        valueType,
        isEncoded: true,
        itemValue: Utils.tob64(item.getBytes())
      }
    }
    if (valueType === "byteArray") {
      return {
        isSuperFetch: true,
        valueType,
        isEncoded: true,
        itemValue: Utils.toB64(item)
      }
    }
    return {
      isSuperFetch: true,
      valueType,
      isEncoded: false,
      // we need to do this to retain the value on unpacking which we'll get at itemValue.valueProp
      itemValue: JSON.stringify({ valueProp: item })
    }
  }
  /**
   * @param {string} base64 a base64 encoded ValuePack
   * @return {ValueUnpack} the original before packing is in .value
   */
  unpack(base64) {

    // the entire object is base64
    // if it's been written by superfetch it'll be parseable
    let undone
    try {
      undone = JSON.parse(this.decode(base64).getDataAsString())
    } catch {
      // its not written by superfetch
      return {
        valueType: 'b64',
        value: Utils.stringFromB64(base64),
        value64: base64
      }
    }

    // this value64 is still encoded, and the name and mimeType will be needed
    const { isSuperFetch, valueType, itemValue, isEncoded, name, contentType } = undone

    if (!isSuperFetch) {
      // its not written by superfetch
      return {
        valueType: 'b64',
        value: base64
      }
    }
    
    // the value is also base64 encoded if its a blob
    const valueBlob = isEncoded ? this.decode(itemValue) : null

    // a blob can be reconstructed from data stored in the secret
    if (valueType === "blob") {
      valueBlob.setName(name)
      valueBlob.setContentType(contentType)
      return {
        value: valueBlob,
        valueType
      }
    } else if (isEncoded) {
      // return the bytes as it was base64 encoded
      return {
        value: valueBlob.getBytes(),
        valueType
      }
    }

    // in all other cases we need to pick out the stringified object first
    const { valueProp } = JSON.parse(itemValue)
    let value
    switch (valueType) {

      case "number":
        value = Number(valueProp)
        break

      case "boolean":
        value = Boolean(valueProp)
        break

      case "string":
      case "object":
      case "array":
        value = valueProp
        break

      case "null":
        value = null
        break

      default:
        throw `unknown value type ${valueType}`
    }

    return {
      value,
      valueType
    }

  }
}