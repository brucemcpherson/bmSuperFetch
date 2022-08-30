class _FakeStream {

  constructor() {
    this._stream = null
    this._tank = null
    this._init = null
    this._start = 0
    this._bytesLength = 0
    this._lastStatus = 206
    this._error = null
    this.upload = null
  }
  
  get location () {
    return this.init && this.init.location
  }
  get error () {
    return this._error
  }

  set error (value) {
    this._error = value
  }

  get isMore () {
    return this.lastStatus === 206 && this.start < this.size
  }

  get data() {
    return this.init && this.init.data
  }
  get name() {
    return this.data && this.data.name
  }

  get contentType() {
    return this.data && this.data.mimeType
  }

  get size() {
    const size = this.data && this.data.size
    return size ? parseInt(size, 10) : 0
  }

  get id() {
    return this.data && this.data.id
  }

  get lastStatus () {
    return this._lastStatus
  }

  set lastStatus(value) {
    this._lastStatus = value
  }

  get bytesLength() {
    return this._bytesLength
  }
  set bytesLength(value) {
    this._bytesLength = value
  }
  get start() {
    return this._start
  }
  set start(value) {
    this._start = value
  }
  get init() {
    return this._init
  }
  set init(value) {
    this._init = value
  }
  get tank() {
    return this._tank
  }
  set tank(value) {
    this._tank = value
  }
  set stream(value) {
    this._stream = value
  }
  get stream() {
    return this._stream
  }

}
