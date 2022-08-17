
class _Tank {
  constructor({ filler, emptier, capacity, name = 'tank' }) {
    this.filler = filler
    this.capacity = capacity
    this.emptier = emptier
    this.pen = []
    this.in = 0
    this.out = 0
    this.createdAt = new Date().getTime()
    this._error = null
    this._done = false
    this._itemsFilled = 0
    this._itemsEmptied = 0
    this.name = name
    this.events = [
      'data',
      'filler-start',
      'filler-end',
      'emptier-start',
      'emptier-end',
      'done',
      'empty',
      'full',
      'error'
    ].reduce((p, c) => {
      p[c] = null
      return p
    }, {})
    if (!this.capacity) throw 'capacity must be > 0'
    if (!this.filler && !this.emptier) throw 'must provide a tank filler or a tank emptier'
  }

  checkError() {
    if (this.error) {
      console.log(this.error)
      this.thrower(`Can't continue after an error`)
    }
  }

  get itemsFilled() {
    return this._itemsFilled
  }

  set itemsFilled(value) {
    this._itemsFilled = value
  }

  get itemsEmptied() {
    return this._itemsEmptied
  }

  set itemsEmptied(value) {
    this._itemsEmptied = value
  }

  set done(value) {
    this._done = value
    if (value) this.emit('done')
  }

  get done() {
    return this._done
  }

  set error(value) {
    this._error = value
    this.emit('error')
  }

  get error() {
    return this._error
  }

  thrower(message) {
    this.error = message
    throw this.error
  }

  checkFunc(action) {
    if (typeof action !== 'function') this.thrower('expected a function for event action')
  }

  checkEvent(eventeventName) {
    if (!Reflect.has(this.events, eventeventName)) this.thrower(`event ${eventeventName} must be one of ${this.events.join(",")}`)
  }

  off(eventeventName) {
    this.checkEvent(eventeventName)
    this.events[eventeventName] = null
    return this
  }

  _readings(eventName) {
    const timeStamp = new Date().getTime()
    return [
      'level',
      'in',
      'out',
      'itemsFilled',
      'itemsEmptied',
      'isDone',
      'error'
    ].reduce((p, c) => {
      p[c] = this[c]
      return p
    }, {

      name: this.name,
      createdAt: this.createdAt,
      capacity: this.capacity,
      timeStamp,
      eventName,
      creationOffset: timeStamp - this.createdAt
    })
  }

  on(eventNames, action) {
    this.checkFunc(action)
    Utils.arrify(eventNames).forEach(eventName => {
      this.checkEvent(eventName)
      this.events[eventName] = action
    })
  }

  emit(eventName) {
    if (this.events[eventName]) this.events[eventName]({ readings: this._readings(eventName), tank: this })
  }

  add(items = []) {
    this.checkError()
    if (items.length) {
      Array.prototype.push.apply(this.pen, items)
      this.in += items.length
      this.emit('data')
      if (this.isFull) this.emit('full')
    }
    return this
  }

  /**
   * fill the tank to the top
   * @return {_Tank} self
   */
  fill() {
    // if we're in an error state refuse
    this.checkError()

    // for as long as we're not full get more
    while (!this.error && !this.isFull && !this.isDone) {
      // use the filler to pick up mext batch
      this.execFiller()
    }
    return this
  }

  /**
   * how much is currently in the tank
   * @return {number} number of items in the tank
   */
  get level() {
    return this.pen.length
  }

  /**
   * is the tank currently empty
   * @return {Boolean}
   */
  get isEmpty() {
    return !this.level
  }

  /**
   * is the input finished
   * @return {Boolean}
   */
  get isDone() {
    return this.done
  }

  /**
   * is the tank currently full or (overfull)
   * @return {Boolean}
   */
  get isFull() {
    return this.level >= this.capacity
  }

  remove(size) {
    if (!size) this.thrower('unexpected attempt to remove 0 items')
    const items = this.pen.splice(0, size)
    if (this.isEmpty) this.emit('empty')
    return items
  }

  execFiller() {
    this.itemsFilled = 0
    this.emit('filler-start')
    const result = this.filler(this)
    this.itemsFilled = result.items && result.items.length
    if (result.error) {
      this.error = result.error
    }
    this.emit('filler-end')
    // a null or undefined items signals input is exhausted
    // otherwise we add the items to pen
    if (!result.items) {
      this.done = true
    } else if (!this.error) {
      this.add(result.items)
    }
  }
  execEmptier(items) {
    this.itemsEmptied = 0
    this.emit('emptier-start')
    const result = this.emptier(this, items)
    this.itemsEmptied = items && items.length
    this.emit('emptier-end')
    if (result && result.error) {
      this.error = result.error
    }
    this.out += items.length
    return result
  }

  /**
   * empty the tank
   * @return {_Tank} self
   */
  empty() {
    // if we're in an error state refuse
    this.checkError()

    // for as long as the tank isn't empty, keep emotying it
    while (!this.error && !this.isEmpty) {
      // write them away
      this.execEmptier(this.remove(this.capacity))
    }
    return this
  }

  /**
   * stream this tank to another
   * @param {_Tank} out the output tank
   * @return {_Tank} self
   */
  pipe(out) {
    // if we're in an error state refuse
    this.checkError()

    // keep going and adding to the the output tank
    while (!this.error && !out.error && !this.isDone) {

      // this will fill the input tank up
      this.fill()

      // while there's something in the input tank
      while (!this.isEmpty && !this.error) {

        // add it to the output tank and remove it from the input tank
        out.add(this.remove(out.capacity))

        // if the output is full/overfull keep emptying
        while (out.isFull) {
          out.empty()
        }
      }
      // clear out any residue left in the output tank
      while (!out.isEmpty && !out.error) out.empty()
    }
  }


}

