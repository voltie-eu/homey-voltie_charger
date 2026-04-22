'use strict';

import Homey from 'homey';

module.exports = class VoltieApp extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('VoltieApp has been initialized');
  }

}