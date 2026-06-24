import Homey from 'homey';
import VoltieAPI from '../../libs/Voltie/VoltieAPI';
import VoltieAPIError from '../../libs/Voltie/VoltieAPIError';
import VoltieDriver, { VoltieSettings } from './driver';
import { StatusResponse, ConfigResponse, ConfigRequest } from '../../libs/Voltie/VoltieAPITypes';

export interface IKeyValue {
  [key: string]: any
};

export interface ICapabilityList {
  id: string;
  options?: IKeyValue;
}

interface IDeviceValues {
  status: StatusResponse | null;
  config: ConfigResponse | null;
}

export default class VoltieDevice extends Homey.Device {
  driver!: VoltieDriver;

  private readonly MAX_API_RETRIES = 60;
  private readonly FAST_POLLING_INTERVAL = 3000;
  private readonly SLOW_POLLING_INTERVAL = 9000;

  private api!: VoltieAPI;
  private apiError: number = 0;
  private pollingTimer: NodeJS.Timeout | null = null;
  private deviceValues: IDeviceValues = { status: null, config: null };
  private capabilityCache: Map<string, any> = new Map();

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

    this.deviceValues = null as any;
    this.capabilityCache.clear();
  }

  // Device capability listeners
  private async onEVChargerChargingChanged(value: boolean): Promise<void> {
    if (this.deviceValues.status?.is_charging === value) return;

    if (!this.deviceValues.status?.is_car_connected) {
      throw new Error(this.homey.__('device.error.car_not_connected'));
    }

    try {
      await (value ? this.api.startCharging() : this.api.stopCharging());
      await this.pollLatest();
    } catch (error: VoltieAPIError | any) {
      if (error.code === 'REQUEST_ABORTED') return;
      throw new Error(this.homey.__('device.error.cant_control_charging', { error }));
    }
  }

  private async onAutostartChanged(value: boolean): Promise<void> {
    if (this.deviceValues.config?.conf_autostart_enabled === value) return;

    try {
      await this.api.updateConfiguration(this.createConfigRequest('conf_autostart_enabled', value));
      await this.pollLatest();
    } catch (error: VoltieAPIError | any) {
      if (error.code === 'REQUEST_ABORTED') return;
      throw new Error(this.homey.__('device.error.cant_set_autostart', { error }));
    }
  }

  private async onForceSinglePhaseChanged(value: boolean): Promise<void> {
    if (this.deviceValues.config?.conf_force_single_phase === (value ? 1 : 0)) return;

    const isCharging = this.deviceValues.status?.is_charging;

    if (isCharging) {
      try {
        await this.api.stopCharging();
        await this.pollLatest();
      } catch (error: VoltieAPIError | any) {
        if (error.code === 'REQUEST_ABORTED') return;
        throw new Error(this.homey.__('device.error.cant_control_charging', { error }));
      }

      await this.delay(2500);
    }

    try {
      await this.api.updateConfiguration(this.createConfigRequest('conf_force_single_phase', value ? 1 : 0));
      await this.pollLatest();
    } catch (error: VoltieAPIError | any) {
      if (error.code === 'REQUEST_ABORTED') return;
      throw new Error(this.homey.__('device.error.cant_set_force_single_phase', { error }));
    }

    if (isCharging) {
      await this.delay(2500);

      try {
        await this.api.startCharging();
        await this.pollLatest();
      } catch (error: VoltieAPIError | any) {
        if (error.code === 'REQUEST_ABORTED') return;
        throw new Error(this.homey.__('device.error.cant_control_charging', { error }));
      }
    }
  }

  private async onFrontLedChanged(value: boolean): Promise<void> {
    if (this.deviceValues.config?.conf_front_led_enabled === value) return;

    try {
      await this.api.updateConfiguration(this.createConfigRequest('conf_front_led_enabled', value));
      await this.pollLatest();
    } catch (error: VoltieAPIError | any) {
      if (error.code === 'REQUEST_ABORTED') return;
      throw new Error(this.homey.__('device.error.cant_set_front_led', { error }));
    }
  }

  private async onRearLedChanged(value: boolean): Promise<void> {
    if (this.deviceValues.config?.conf_rear_led_enabled === value) return;

    try {
      await this.api.updateConfiguration(this.createConfigRequest('conf_rear_led_enabled', value));
      await this.pollLatest();
    } catch (error: VoltieAPIError | any) {
      if (error.code === 'REQUEST_ABORTED') return;
      throw new Error(this.homey.__('device.error.cant_set_rear_led', { error }));
    }
  }

  private async onCurrentLimitChanged(value: string): Promise<void> {
    const currentLimit = parseInt(value, 10)
    if (this.deviceValues.config?.conf_current_limit === currentLimit) return;

    if (currentLimit > parseInt(this.getSetting('maxCurrentLimit'), 10)){
      throw new Error(this.homey.__('device.error.over_set_current_limit', { currentLimit }));
    }

    try {
      await this.api.updateConfiguration(this.createConfigRequest('conf_current_limit', currentLimit));
      await this.pollLatest();
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

    this.pollLatest();
  }

  private async pollLatest(getConfig: boolean = true): Promise<void> {
    this.stopPolling();

    try {
      this.deviceValues.status = await this.api.getStatus();
      if (getConfig) this.deviceValues.config = await this.api.getConfiguration();

      this.apiError = 0;
      if (!this.getAvailable()) await this.setAvailable();
    } catch (error: VoltieAPIError | any) {
      if (error.code !== 'REQUEST_ABORTED') {
        if (++this.apiError < this.MAX_API_RETRIES) {
          this.log(`API error occurred (attempt ${this.apiError}/${this.MAX_API_RETRIES}):`, error);
          await this.setUnavailable(this.homey.__('device.error.unavailable', { error }));

          this.pollingTimer = this.homey.setTimeout(() => this.pollLatest(), this.FAST_POLLING_INTERVAL + this.apiError * 1000);
        } else {
          this.error(`Maximum API retry attempts reached (${this.MAX_API_RETRIES}). Stopping polling.`);
          await this.setUnavailable(this.homey.__('device.error.max_retries_reached'));
        }
      } else {
        this.log('Polling request was aborted');
      }

      return Promise.resolve();
    }

    this.updateCapabilityOptions();
    this.updateCapabilityValues();

    const interval = this.deviceValues.status?.is_car_connected ? this.FAST_POLLING_INTERVAL : this.SLOW_POLLING_INTERVAL;
    this.pollingTimer = this.homey.setTimeout(() => this.pollLatest(!getConfig), interval);

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
    return this.deviceValues.config?.conf_autostart_enabled || false;
  }

  public getForceSinglePhase(): boolean {
    return this.deviceValues.config?.conf_force_single_phase === 1;
  }

  public getFrontLed(): boolean {
    return this.deviceValues.config?.conf_front_led_enabled || false;
  }

  public getRearLed(): boolean {
    return this.deviceValues.config?.conf_rear_led_enabled || false;
  }

  public getIsCarConnected(): boolean {
    return this.deviceValues.status?.is_car_connected || false;
  }

  // Update Capabilies
  private updateCapabilityValues(): void {
    const status = this.deviceValues.status;
    if (status) {
      this.updateCapabilityValue('evcharger_charging', status.is_charging);
      this.updateCapabilityValue('evcharger_charging_state', this.mapEVState(status));
      this.updateCapabilityValue('measure_power', status.charge_power * 1000);
      this.updateCapabilityValue('measure_current', status.charge_current);
      this.updateCapabilityValue('active_phases', status.phases_used);

      if (status.cdr) {
        this.updateCapabilityValue('meter_power', status.cdr.chg_energy);
        this.updateCapabilityValue('charging_time', new Date(status.cdr.chg_time * 1000).toISOString().slice(11, 19));
      } else {
        this.updateCapabilityValue('meter_power', 0);
        this.updateCapabilityValue('charging_time', '00:00:00');
      }
    }

    const config = this.deviceValues.config;
    if (config) {
      const autostartValue = !!config.conf_autostart_enabled;
      if (this.updateCapabilityValue('autostart', autostartValue)) {
        this.driver.autostartTriggerCard.trigger(this, { autostart: autostartValue }, {}).catch(this.error);
      }

      const forceSinglePhaseValue = config.conf_force_single_phase === 1;
      if (this.updateCapabilityValue('force_single_phase', forceSinglePhaseValue)) {
        this.driver.forceSinglePhaseTriggerCard.trigger(this, { force_single_phase: forceSinglePhaseValue }, {}).catch(this.error);
      }

      const frontLedValue = !!config.conf_front_led_enabled;
      if (this.updateCapabilityValue('front_led', frontLedValue)) {
        this.driver.frontLedTriggerCard.trigger(this, { front_led: frontLedValue }, {}).catch(this.error);
      }

      const rearLedValue = !!config.conf_rear_led_enabled;
      if (this.updateCapabilityValue('rear_led', rearLedValue)) {
        this.driver.rearLedTriggerCard.trigger(this, { rear_led: rearLedValue }, {}).catch(this.error);
      }

      const currentLimitValue = config.conf_current_limit;
      if (this.updateCapabilityValue('current_limit', currentLimitValue.toString())) {
        this.driver.currentLimitTriggerCard.trigger(this, { current_limit: currentLimitValue }, {}).catch(this.error);
      }
    }
  }

  private updateCapabilityValue(capabilityId: string, value: any): boolean {
    if (this.hasCapability(capabilityId) && value !== null && value !== undefined) {
      if (value !== this.capabilityCache.get(capabilityId)) {
        this.setCapabilityValue(capabilityId, value).catch((error) => {
          this.error(`Failed to update capability ${capabilityId} to:`, value, error);
          this.capabilityCache.delete(capabilityId);
        });
        this.capabilityCache.set(capabilityId, value);
        return true;
      }
    }
    return false;
  }

  private updateCapabilityOptions(): void {
    const status = this.deviceValues.status;
    if (status) {
      this.updateCapabilityOption('current_limit', status.current_hw_limit);
    }
  }

  private updateCapabilityOption(capabilityId: string, option: any): void {
    if (this.hasCapability(capabilityId)) {
      switch (capabilityId) {
        case 'current_limit' :
          const value = Math.min(this.getSetting('maxCurrentLimit'), option).toString();
          if (value !== this.capabilityCache.get('current_limit')) {
            this.setCapabilityOptions('current_limit', { values: this.createCurrentLimitOption(parseInt(value,10)) }).catch((error) => {
              this.error('Failed to set capability options for current_limit:', error);
              this.capabilityCache.delete('current_limit');
            });
            
            this.setSettings({...this.getSettings(), maxCurrentLimit: value.toString()});
            this.capabilityCache.set('current_limit', value);
          }
          break;
      }
    }
  }

  // Helper methods
  private createCurrentLimitOption(limit: number): { id: string; title: { en: string } }[] {
    limit = Math.max(6, Math.min(limit, 32));
    const values = [];
    for (let i = 6; i <= limit; i++) {
      values.push({
        id: i.toString(),
        title: { en: `Max current ${i}A` },
      });
    };
    return values;
  }

  private createConfigRequest(attr: keyof ConfigRequest, value: any): ConfigRequest {
    if (!this.deviceValues.config) this.deviceValues.config = {} as ConfigResponse;
    this.deviceValues.config[attr] = value as never;

    const configRequest: ConfigRequest = {};
    const configRequestKeys: (keyof ConfigRequest)[] = attr === 'conf_current_limit' ? [
      'conf_current_limit',
    ] : [
      'conf_autostart_enabled',
      'conf_current_limit',
      'conf_front_led_enabled',
      'conf_rear_led_enabled',
      'conf_force_single_phase'
    ];

    for (const key of configRequestKeys) {
      const val = this.deviceValues.config[key];
      if (val !== null && val !== undefined) configRequest[key] = val as never;
    }
    return configRequest;
  }

  private mapEVState(status: StatusResponse): string {
    if (!status.is_car_connected) {
      return 'plugged_out';
    }

    if (status.is_car_connected && !this.deviceValues.status?.is_car_connected) {
      return 'plugged_in';
    }

    if (status.is_charging) {
      return 'plugged_in_charging';
    }

    return 'plugged_in_paused';
  }

  private async setupCapabilites(remove: ICapabilityList[], add: ICapabilityList[]) {
    for (const cap of remove) {
      if (this.hasCapability(cap.id)) await this.removeCapability(cap.id);
    }

    for (const cap of add) {
      if (!this.hasCapability(cap.id)) {
        await this.addCapability(cap.id);
        if (cap.options) await this.setCapabilityOptions(cap.id, cap.options);
      }
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => this.homey.setTimeout(resolve, ms));
  }
};

module.exports = VoltieDevice;