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
  forceSinglePhaseTriggerCard!: Homey.FlowCardTriggerDevice;
  frontLedTriggerCard!: Homey.FlowCardTriggerDevice;
  rearLedTriggerCard!: Homey.FlowCardTriggerDevice;
  
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('VoltieDriver has been initialized');

    this.registerConditionListener('autostart', 'getAutostart');
    this.registerConditionListener('force_single_phase', 'getForceSinglePhase');
    this.registerConditionListener('front_led', 'getFrontLed');
    this.registerConditionListener('rear_led', 'getRearLed');
    this.registerConditionListener('is_car_connected', 'getIsCarConnected');

    this.registerCapabilityAction('set_autostart', 'setAutostart', 'autostart');
    this.registerCapabilityAction('set_current_limit', 'setCurrentLimit', 'current_limit');
    this.registerCapabilityAction('set_force_single_phase', 'setForceSinglePhase', 'force_single_phase');
    this.registerCapabilityAction('set_front_led', 'setFrontLed', 'front_led');
    this.registerCapabilityAction('set_rear_led', 'setRearLed', 'rear_led');

    this.currentLimitTriggerCard = this.homey.flow.getDeviceTriggerCard('current_limit_changed');
    this.autostartTriggerCard = this.homey.flow.getDeviceTriggerCard('autostart_changed');
    this.forceSinglePhaseTriggerCard = this.homey.flow.getDeviceTriggerCard('force_single_phase_changed');
    this.frontLedTriggerCard = this.homey.flow.getDeviceTriggerCard('front_led_changed');
    this.rearLedTriggerCard = this.homey.flow.getDeviceTriggerCard('rear_led_changed');
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

  registerConditionListener(condition: string, listener: string) {
    this.homey.flow.getConditionCard(condition).registerRunListener(async (args: any, state: any) => {
      return (args.device[listener] as Function).apply(args.device);
    });
  }

  registerCapabilityAction(capability: string, listener: string, valueName: string | string[]) {
    this.homey.flow.getActionCard(capability).registerRunListener(async (args: any, state: any) => {
      const values = [];
      if(Array.isArray(valueName)) valueName.forEach(v => values.push(args[v]));
      else values.push(args[valueName]);
      
      await (args.device[listener] as Function).apply(args.device, values);
    })
  }
};

module.exports = VoltieDriver;