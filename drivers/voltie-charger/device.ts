import Homey from 'homey';
import VoltieAPI from '../../libs/Voltie/VoltieAPI';
import { VoltieSettings } from './driver';

module.exports = class VoltieDevice extends Homey.Device {
  static DEFAULT_PULLING_INTERVAL = 10000;
  static CONNECTED_PULLING_INTERVAL = 5000;

  private api!: VoltieAPI;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('VoltieDevice has been initialized');

    this.applaySettings(this.getSettings());

    console.log(await this.api.getStatus());
    console.log(await this.api.getPowerDetails());
    console.log(await this.api.getConfiguration());

    this.setCapabilityValue('evcharger_charging_state', 'plugged_out');
    this.setCapabilityValue('current_limit', '6');

    /*  
      evcharger_charging_state:
        plugged_out
        plugged_in
        plugged_in_charging
        plugged_in_discharging
        plugged_in_paused
     */
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('VoltieDevice has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys}: { oldSettings: any; newSettings: any; changedKeys: any;}): Promise<string | void> {
    this.log("VoltieDevice settings where changed");
    this.applaySettings(newSettings);
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('VoltieDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('VoltieDevice has been deleted');
  }

  applaySettings(newSettings: VoltieSettings){
    if(this.api) this.api.destroy();
    this.api = new VoltieAPI({
      ip: newSettings.ip,
      port: newSettings.port,
      username: newSettings.username?.length ? newSettings.username : undefined,
      password: newSettings.password?.length ? newSettings.password : undefined
    });
    this.setMaxCurrentLimit(newSettings.maxCurrentLimit);
  }

  setMaxCurrentLimit(limit: number){
    const values: { id: string; title: { en: string } }[] = [];
    for (var i = 6; i <= limit; i++){
      values.push({id: i.toString(), title: { "en": `Max current ${i}A`}});
    }
    this.setCapabilityOptions('current_limit', { values });
  }

};
