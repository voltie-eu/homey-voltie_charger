import Homey, { DiscoveryResultMDNSSD } from 'homey';
import { PairSession } from 'homey/lib/Driver';

export interface VoltieData{
  id: string; // The device hostname
}
export interface VoltieSettings{
  ip: string;
  port?: number;
  username?: string;
  password?: string;
}
export interface VoltieDevice {
  name: string;
  data: VoltieData;
  settings: VoltieSettings;
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
          } as VoltieDevice;
        }),
      );
    });

    session.setHandler('list_devices_selection', async (devices: VoltieDevice[]) => {
      selectedDevice = devices[0];
    });

    session.setHandler('get_device', async () => {
      return selectedDevice;
    });

    session.setHandler('get_new_device', async (device: VoltieDevice) => {
      return this.getNewDevices([device])[0];
    });
  }

  getNewDevices(discoveredDevices:VoltieDevice[]) {
    const pairedDevices = Object.values(this.getDevices());
    const newDevices:VoltieDevice[] = [];

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
