import Homey, { DiscoveryResultMDNSSD } from 'homey';
import { PairSession } from 'homey/lib/Driver';
import VoltieDevice from './device';

export interface VoltieData{
  id: string; // The device hostname
}
export interface VoltieSettings{
  ip: string;
  port: number;
  maxCurrentLimit: number;
  username?: string;
  password?: string;
}
export interface VoltieDeviceProps {
  name: string;
  data: VoltieData;
  settings: VoltieSettings;
}

export default class VoltieDriver extends Homey.Driver {
  currentLimitTriggerCard!: Homey.FlowCardTriggerDevice;
  autostartTriggerCard!: Homey.FlowCardTriggerDevice;

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('VoltieDriver has been initialized');

    this.registerCapabilityCondition('autostart');

    this.registerCapabilityAction('set_current_limit', 'onCurrentLimitChanged', 'current_limit');
    this.registerCapabilityAction('set_autostart', 'onAutostartChanged', 'autostart');

    this.currentLimitTriggerCard = this.homey.flow.getDeviceTriggerCard('current_limit_changed');
    this.autostartTriggerCard = this.homey.flow.getDeviceTriggerCard('autostart_changed');
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
          } as VoltieDeviceProps;
        }),
      );
    });

    session.setHandler('list_devices_selection', async (devices: VoltieDeviceProps[]) => {
      selectedDevice = devices[0];
    });

    session.setHandler('get_device', async () => {
      return selectedDevice;
    });

    session.setHandler('get_new_device', async (device: VoltieDeviceProps) => {
      return this.getNewDevices([device])[0];
    });
  }

  getNewDevices(discoveredDevices:VoltieDeviceProps[]) {
    const pairedDevices = Object.values(this.getDevices());
    const newDevices:VoltieDeviceProps[] = [];

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

  registerCapabilityCondition(capability: string) {
    this.homey.flow.getConditionCard(capability).registerRunListener(async (args: any, state: any) => {
      return (args.device as VoltieDevice).getCapabilityValue(capability);
    });
  }

  registerCapabilityAction(capability: string, listener: string, valueName: string | string[]) {
    this.homey.flow.getActionCard(capability).registerRunListener(async (args: any, state: any) => {
      const values = [];
      if(Array.isArray(valueName)) valueName.forEach(v => values.push(args[v]));
      else values.push(args[valueName]);
      
      (args.device[listener] as Function).apply(args.device, values);
    })
  }
};

module.exports = VoltieDriver;