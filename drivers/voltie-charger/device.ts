import Homey from 'homey';
import VoltieAPI from '../../libs/Voltie/VoltieAPI';
import VoltieAPIError from '../../libs/Voltie/VoltieAPIError';
import VoltieDriver, { VoltieSettings } from './driver';
import { StatusResponse, ConfigResponse } from '../../libs/Voltie/VoltieAPITypes';

export interface IKeyValue { 
  [key: string]: any
};

export interface ICapabilityList{
  id: string;
  options?: IKeyValue;
}

export default class VoltieDevice extends Homey.Device {
  driver!: VoltieDriver;

  private readonly MAX_API_RETRIES = 60;
  private readonly FAST_POLLING_INTERVAL = 3000;
  private readonly SLOW_POLLING_INTERVAL = 9000;

  private api!: VoltieAPI;
  private apiError: number = 0;
  private pollingTimer: NodeJS.Timeout | null = null;
  private previousCapabilityValues: Map<string, any> = new Map();

  private latestValues: {
    status: StatusResponse | null;
    config: ConfigResponse | null;
  } = { status: null, config: null };

  // Device lifecycle methods
  async onInit(): Promise<void> {
    this.log('VoltieDevice has been initialized');

    await this.setupCapabilites([
      { id: 'phase' }, // Renamed to 'active_phases' in v1.1
    ], [
      { id: 'active_phases' } // Renamed from 'phase' in v1.1
    ]);

    this.registerCapabilityListener('evcharger_charging', this.onEVChargerChargingChanged.bind(this));
    this.registerCapabilityListener('autostart', this.onAutostartChanged.bind(this));
    this.registerCapabilityListener('force_single_phase', this.onForceSinglePhaseChanged.bind(this));
    this.registerCapabilityListener('front_led', this.onFrontLedChanged.bind(this));
    this.registerCapabilityListener('rear_led', this.onRearLedChanged.bind(this));
    this.registerCapabilityListener('current_limit', this.onCurrentLimitChanged.bind(this));
    
    this.startPolling(this.getSettings());
  }

  async onAdded(): Promise<void> {
    this.log('VoltieDevice has been added');
  }

  async onSettings({ oldSettings, newSettings, changedKeys }: { oldSettings: any; newSettings: any; changedKeys: string[] }): Promise<string | void> {
    this.log('VoltieDevice settings were changed', changedKeys);

    this.startPolling(newSettings);
  }

  async onRenamed(name: string): Promise<void> {
    this.log('VoltieDevice was renamed to:', name);
  }

  async onDeleted(): Promise<void> {
    this.log('VoltieDevice has been deleted');

    this.stopPolling();
    if (this.api) this.api.destroy();

    this.previousCapabilityValues.clear();
  }

  // Device capability listeners
  private async onEVChargerChargingChanged(value: boolean): Promise<void> {
    if(!this.latestValues.status?.is_car_connected) {
      throw new Error(this.homey.__('device.error.car_not_connected'));
    }

    try {
      await (value ? this.api.startCharging() : this.api.stopCharging());
      await this.pollLatest(1000);
    } catch (error: VoltieAPIError | any) {
      if (error.code === 'REQUEST_ABORTED') return;
      throw new Error(this.homey.__('device.error.cant_control_charging', { error }));
    }
  }

  private async onAutostartChanged(value: boolean): Promise<void> {
    try {
      await this.api.updateConfiguration({ conf_autostart_enabled: value });
      await this.pollLatest(1000);
    } catch (error: VoltieAPIError | any) {
      if (error.code === 'REQUEST_ABORTED') return;
      throw new Error(this.homey.__('device.error.cant_set_autostart', { error }));
    }
  }

  private async onForceSinglePhaseChanged(value: boolean): Promise<void> {
    const isCharging = this.latestValues.status?.is_charging;

    if(isCharging) {
      try {
        await this.api.stopCharging();
        await this.pollLatest(2500);
      } catch (error: VoltieAPIError | any) {
        if (error.code === 'REQUEST_ABORTED') return;
        throw new Error(this.homey.__('device.error.cant_control_charging', { error }));
      }
    }
    
    try {
      await this.api.updateConfiguration({ conf_force_single_phase: value ? 1 : 0 });
      await this.pollLatest(2500);
    } catch (error: VoltieAPIError | any) {
      if (error.code === 'REQUEST_ABORTED') return;
      throw new Error(this.homey.__('device.error.cant_set_force_single_phase', { error }));
    }

    if(isCharging) {
      try {
        await this.api.startCharging();
        await this.pollLatest(1000);
      } catch (error: VoltieAPIError | any) {
        if (error.code === 'REQUEST_ABORTED') return;
        throw new Error(this.homey.__('device.error.cant_control_charging', { error }));
      }
    }
  }

  private async onFrontLedChanged(value: boolean): Promise<void> {
    try {
      await this.api.updateConfiguration({ conf_front_led_enabled: value });
      await this.pollLatest(1000);
    } catch (error: VoltieAPIError | any) {
      if (error.code === 'REQUEST_ABORTED') return;
      throw new Error(this.homey.__('device.error.cant_set_front_led', { error }));
    }
  }

  private async onRearLedChanged(value: boolean): Promise<void> {
    try {
      await this.api.updateConfiguration({ conf_rear_led_enabled: value });
      await this.pollLatest(1000);
    } catch (error: VoltieAPIError | any) {
      if (error.code === 'REQUEST_ABORTED') return;
      throw new Error(this.homey.__('device.error.cant_set_rear_led', { error }));
    }
  }

  private async onCurrentLimitChanged(value: string): Promise<void> {
    try {
      await this.api.updateConfiguration({ conf_current_limit: parseInt(value, 10) });
      await this.pollLatest(1000);
    } catch (error: VoltieAPIError | any) {
      if (error.code === 'REQUEST_ABORTED') return;
      throw new Error(this.homey.__('device.error.cant_set_current_limit', { error }));
    }
  }

  // Pooling methods
  private startPolling(newSettings: VoltieSettings): void {
    this.stopPolling();

    if (this.api) this.api.destroy();

    this.api = new VoltieAPI({
      ip: newSettings.ip,
      port: newSettings.port || 5059,
      username: newSettings.username?.length ? newSettings.username : undefined,
      password: newSettings.password?.length ? newSettings.password : undefined,
    });
    
    this.updateCurrentLimitOptions(newSettings.maxCurrentLimit);
    
    this.pollLatest();
  }

  private async pollLatest(delay: number = 0, getConfig: boolean = true): Promise<void> {
    this.stopPolling();

    if (delay > 0) await new Promise(resolve => this.pollingTimer = this.homey.setTimeout(resolve, delay));

    try {
      this.latestValues.status = await this.api.getStatus();
      if(getConfig) this.latestValues.config = await this.api.getConfiguration();
      
      this.apiError = 0;
      if(!this.getAvailable()) await this.setAvailable();
    } catch (error: VoltieAPIError | any) {
      if (error.code !== 'REQUEST_ABORTED') {
        if (++this.apiError < this.MAX_API_RETRIES){
          this.log(`API error occurred (attempt ${this.apiError}/${this.MAX_API_RETRIES}):`, error);
          await this.setUnavailable(this.homey.__('device.error.unavailable', { error }));

          this.pollLatest(this.FAST_POLLING_INTERVAL + this.apiError * 1000);
        } else {
          this.error(`Maximum API retry attempts reached (${this.MAX_API_RETRIES}). Stopping polling.`);
          await this.setUnavailable(this.homey.__('device.error.max_retries_reached'));
        }
      } else {
        this.log('Polling request was aborted');
      }

      return Promise.resolve();
    }

    this.updateCapabilityValues();
    this.pollLatest(this.latestValues.status?.is_car_connected ? this.FAST_POLLING_INTERVAL : this.SLOW_POLLING_INTERVAL, !getConfig);

    return Promise.resolve();
  }

  private stopPolling(): void {
    if (this.pollingTimer) this.homey.clearInterval(this.pollingTimer);
    this.pollingTimer = null;
  }

  // Setters
  public async setAutostart(value: string): Promise<void> {
    return this.onAutostartChanged(value === 'true');
  }

  public async setForceSinglePhase(value: string): Promise<void> {
    return this.onForceSinglePhaseChanged(value === 'true');
  }

  public async setFrontLed(value: string): Promise<void> {
    return this.onFrontLedChanged(value === 'true');
  }

  public async setRearLed(value: string): Promise<void> {
    return this.onRearLedChanged(value === 'true');
  }

  public async setCurrentLimit(value: number): Promise<void> {
    return this.onCurrentLimitChanged(value.toString());
  }

  // Getters
  public getAutostart(): boolean {
    return this.latestValues.config?.conf_autostart_enabled || false;
  }

  public getForceSinglePhase(): boolean {
    return this.latestValues.config?.conf_force_single_phase === 1;
  }

  public getFrontLed(): boolean {
    return this.latestValues.config?.conf_front_led_enabled || false;
  }

  public getRearLed(): boolean {
    return this.latestValues.config?.conf_rear_led_enabled || false;
  }

  public getIsCarConnected(): boolean {
    return this.latestValues.status?.is_car_connected || false;
  }

  // Helper methods
  private updateCapabilityValues(): void {
    if(this.latestValues.status){
      this.updateCapabilityValue('evcharger_charging', this.latestValues.status.is_charging);
      this.updateCapabilityValue('evcharger_charging_state', this.mapEVState(this.latestValues.status));
      this.updateCapabilityValue('measure_power', this.latestValues.status.charge_power * 1000);
      this.updateCapabilityValue('measure_current', this.latestValues.status.charge_current);
      this.updateCapabilityValue('active_phases', this.latestValues.status.phases_used);
      
      if(this.latestValues.status.cdr) {
        this.updateCapabilityValue('meter_power', this.latestValues.status.cdr.chg_energy);
        this.updateCapabilityValue('charging_time', new Date(this.latestValues.status.cdr.chg_time * 1000).toISOString().slice(11, 19));
      } else{
        this.updateCapabilityValue('meter_power', 0);
        this.updateCapabilityValue('charging_time', '00:00:00');
      }
    }
    
    if(this.latestValues.config) {
      const autostartValue = !!this.latestValues.config.conf_autostart_enabled;
      if(this.updateCapabilityValue('autostart', autostartValue)) {
        this.driver.autostartTriggerCard.trigger(this, { autostart: autostartValue }, {}).catch(this.error);
      }

      const forceSinglePhaseValue = this.latestValues.config.conf_force_single_phase === 1;
      if(this.updateCapabilityValue('force_single_phase', forceSinglePhaseValue)) {
        this.driver.forceSinglePhaseTriggerCard.trigger(this, { force_single_phase: forceSinglePhaseValue }, {}).catch(this.error);
      }

      const frontLedValue = !!this.latestValues.config.conf_front_led_enabled;
      if(this.updateCapabilityValue('front_led', frontLedValue)) {
        this.driver.frontLedTriggerCard.trigger(this, { front_led: frontLedValue }, {}).catch(this.error);
      }

      const rearLedValue = !!this.latestValues.config.conf_rear_led_enabled;
      if(this.updateCapabilityValue('rear_led', rearLedValue)) {
        this.driver.rearLedTriggerCard.trigger(this, { rear_led: rearLedValue }, {}).catch(this.error);
      }

      const currentLimitValue = this.latestValues.config.conf_current_limit;
      if(this.updateCapabilityValue('current_limit', currentLimitValue.toString())) {
        this.driver.currentLimitTriggerCard.trigger(this, { current_limit: currentLimitValue }, {}).catch(this.error);
      }
    }
  }

  private updateCapabilityValue(capabilityId: string, value: any): boolean {
    if(this.hasCapability(capabilityId) && value !== null && value !== undefined) {
      if(value !== this.previousCapabilityValues.get(capabilityId)) {
        this.setCapabilityValue(capabilityId, value).catch((error) => {
          this.error(`Failed to update capability ${capabilityId} to:`, value, error);
        });
        this.previousCapabilityValues.set(capabilityId, value);
        return true;
      }
    }
    return false;
  }

  private updateCurrentLimitOptions(limit: number): void {
    limit = Math.max(6, Math.min(limit, 32));
    if (this.hasCapability('current_limit')) {
      const values: { id: string; title: { en: string } }[] = [];
      for (let i = 6; i <= limit; i++) {
        values.push({
          id: i.toString(),
          title: { en: `Max current ${i}A` },
        });
      }
      this.setCapabilityOptions('current_limit', { values }).catch((error) => {
        this.error('Failed to set capability options for current_limit:', error);
      });
    }
  }

  private mapEVState(latest: StatusResponse): string {
    if (!latest.is_car_connected) {
      return 'plugged_out';
    }

    if (latest.is_car_connected && this.previousCapabilityValues.get('evcharger_charging_state') === 'plugged_out') {
      return 'plugged_in';
    }

    if (latest.is_charging) {
      return 'plugged_in_charging';
    }

    return 'plugged_in_paused';
  }

  private async setupCapabilites(remove: ICapabilityList[], add: ICapabilityList[]) {
    for (const cap of remove){
      if (this.hasCapability(cap.id)) await this.removeCapability(cap.id);
    }

    for (const cap of add){
      if (!this.hasCapability(cap.id)){
        await this.addCapability(cap.id);
        if(cap.options) await this.setCapabilityOptions(cap.id, cap.options);
      }
    }
  }
};

module.exports = VoltieDevice;