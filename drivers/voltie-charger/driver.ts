import Homey, { DiscoveryResultMDNSSD } from 'homey';
import { PairSession } from 'homey/lib/Driver';

export interface IDeviceData{
  id: string; // The device hostname
}
export interface IDeviceSettings{
  ip: string;
  port?: number;
  user?: string;
  pass?: string;
}
export interface IDevice {
  name: string;
  data: IDeviceData;
  settings: IDeviceSettings;
}

module.exports = class VoltieDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('VoltieDriver has been initialized');
  }

  async onPair(session: PairSession) {
    let selectedDevice: any;

    session.setHandler('list_devices', async () => {
      const discoveryStrategy = this.getDiscoveryStrategy();
      const discoveryResults = discoveryStrategy.getDiscoveryResults() as { [id: string]: DiscoveryResultMDNSSD };

      return this.getNewDevices(
        Object.keys(discoveryResults).map(key => {
          const device = discoveryResults[key];
          return {
            name: device.name,
            data: {
              id: device.id,
            },
            settings: {
              ip: device.address
            },
          } as IDevice;
        }),
      );
    });

    session.setHandler('list_devices_selection', async (devices: IDevice[]) => {
      selectedDevice = devices[0];
    });

    session.setHandler('get_device', async () => {
      return selectedDevice;
    });

    session.setHandler('get_new_device', async (device: IDevice) => {
      return this.getNewDevices([device])[0];
    });
  }

  getNewDevices(discoveredDevices:IDevice[]) {
    const pairedDevices = Object.values(this.getDevices());
    const newDevices:IDevice[] = [];

    let newDevice = true;
    discoveredDevices.forEach(discoveredDevice => {
      newDevice = true;
      for (const pairedDevice of pairedDevices) {
        if (discoveredDevice.data.id === pairedDevice.getData().id) {
          newDevice = false;
          break;
        }
      }
      if (newDevice) newDevices.push(discoveredDevice);
    });

    return newDevices;
  }
};
