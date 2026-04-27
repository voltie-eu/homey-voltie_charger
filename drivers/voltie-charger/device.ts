import Homey from 'homey';
import VoltieAPI from '../../libs/Voltie/VoltieAPI';
import VoltieAPIError from '../../libs/Voltie/VoltieAPIError';
import { VoltieSettings } from './driver';
import { EVSEState, StatusResponse, PowerResponse, ConfigResponse, GetCDRResponse } from '../../libs/Voltie/VoltieAPITypes';

module.exports = class VoltieDevice extends Homey.Device {
  private readonly MAX_API_RETRIES = 60;
  private readonly FAST_POLLING_INTERVAL = 3000;
  private readonly SLOW_POLLING_INTERVAL = 9000;

  private api!: VoltieAPI;
  private apiError: number = 0;
  private pollingTimer: NodeJS.Timeout | null = null;

  private latest: {
    status: StatusResponse | null;
    CDR: GetCDRResponse | null;
    config: ConfigResponse | null;
  } = { status: null, CDR: null, config: null };

  async onInit(): Promise<void> {
    this.log('VoltieDevice has been initialized');

    this.registerCapabilityListener('evcharger_charging', this.onEVChargerChargingChanged.bind(this));
    this.registerCapabilityListener('autostart', this.onAutostartChanged.bind(this));
    this.registerCapabilityListener('current_limit', this.onCurrentLimitChanged.bind(this));
    
    await this.startPolling(this.getSettings());
  }

  async onAdded(): Promise<void> {
    this.log('VoltieDevice has been added');
  }

  async onSettings({ oldSettings, newSettings, changedKeys }: { oldSettings: any; newSettings: any; changedKeys: string[] }): Promise<string | void> {
    this.log('VoltieDevice settings were changed', changedKeys);

    await this.startPolling(newSettings);
  }

  async onRenamed(name: string): Promise<void> {
    this.log('VoltieDevice was renamed to:', name);
  }

  async onDeleted(): Promise<void> {
    this.log('VoltieDevice has been deleted');

    this.stopPolling();
    if (this.api) await this.api.destroy();
  }

  // Device settings listeners
  async onEVChargerChargingChanged(value: boolean): Promise<void> {
    if(!this.latest.status?.is_car_connected) {
      throw new Error('Car is not connected');
    }

    try {
      this.log('Charging changed:', value);

      if (value) await this.api.startCharging();
      else await this.api.stopCharging();

      return this.pollLatest();
    } catch (error) {
      this.error('Failed to control charging:', error);
      throw error;
    }
  }

  async onAutostartChanged(value: boolean): Promise<void> {
    try {
      this.log('Autostart changed:', value);
      await this.api.updateConfiguration({ conf_autostart_enabled: value });
      
      return this.pollLatest();
    } catch (error) {
      this.error('Failed to set autostart:', error);
      throw error;
    }
  }

  async onCurrentLimitChanged(value: string): Promise<void> {
    try {
      this.log('Current limit changed:', parseInt(value, 10));
      await this.api.updateConfiguration({ conf_current_limit: parseInt(value, 10) });
      
      return this.pollLatest();
    } catch (error) {
      this.error('Failed to set current limit:', error);
      throw error;
    }
  }

  // Pooling and state management
  private async startPolling(newSettings: VoltieSettings): Promise<void> {
    this.stopPolling();

    if (this.api) await this.api.destroy();
    this.api = new VoltieAPI({
      ip: newSettings.ip,
      port: newSettings.port || 5059,
      username: newSettings.username?.length ? newSettings.username : undefined,
      password: newSettings.password?.length ? newSettings.password : undefined,
    });
    
    this.setMaxCurrentLimit(newSettings.maxCurrentLimit);
    
    await this.pollLatest();
  }

  private async pollLatest(): Promise<void> {
    this.stopPolling();

    try {
      this.latest.status = await this.api.getStatus();
      this.latest.config = await this.api.getConfiguration();
      if (this.latest.status.is_charging) this.latest.CDR = await this.api.getCDR(this.latest.status.last_cdr);

      this.apiError = 0;
      await this.setAvailable();
    } catch (error) {
      if (++this.apiError < this.MAX_API_RETRIES){
        await this.setUnavailable(this.homey.__('device.unavailable', { error }));
        this.pollingTimer = this.homey.setTimeout(this.pollLatest.bind(this), this.apiError * 1000);
      } else await this.setUnavailable(this.homey.__('device.max_retries_reached'));

      return Promise.resolve();
    } 

    if(this.latest.status){
      this.updateCapabilityValue('evcharger_charging', this.latest.status.is_charging);
      this.updateCapabilityValue('evcharger_charging_state', this.getEVState(this.latest.status));
      this.updateCapabilityValue('measure_power', this.latest.status.charge_power);
      this.updateCapabilityValue('measure_current', this.latest.status.charge_current);
    }

    if(this.latest.CDR) {
      this.updateCapabilityValue('meter_power', this.latest.CDR.cdr.chg_energy.toString());
    }
    
    if(this.latest.config) {
      this.updateCapabilityValue('autostart', !!this.latest.config.conf_autostart_enabled);
      this.updateCapabilityValue('current_limit', this.latest.config.conf_current_limit.toString());
    }

    this.pollingTimer = this.homey.setTimeout(this.pollLatest.bind(this), this.latest.status.is_car_connected ? this.FAST_POLLING_INTERVAL : this.SLOW_POLLING_INTERVAL);

    return Promise.resolve();
  }

  private stopPolling(): void {
    if (this.pollingTimer) this.homey.clearInterval(this.pollingTimer);
    this.pollingTimer = null;
  }

  // Helper methods
  private async updateCapabilityValue(capabilityId: string, value: any): Promise<void> {
    if(this.hasCapability(capabilityId) && value !== null && value !== undefined) {
      return await this.setCapabilityValue(capabilityId, value).catch((error) => {
        this.error(`Failed to update capability ${capabilityId} to:`, value, error);
      });
    }
    return Promise.resolve();
  }

  private setMaxCurrentLimit(limit: number): void {
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

  private getEVState(latest: StatusResponse): string {
    if (!latest.is_car_connected) {
      return 'plugged_out';
    }

    if (latest.is_charging) {
      return 'plugged_in_charging';
    }

    if (latest.evse_state === EVSEState.CONNECTED_CHARGING_READY || latest.evse_state === EVSEState.CONNECTED_NOT_CHARGING) {
      return 'plugged_in_paused';
    }

    return 'plugged_in';
  }
};
