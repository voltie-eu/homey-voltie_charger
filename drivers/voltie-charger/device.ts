import Homey from 'homey';
import VoltieAPI from '../../libs/Voltie/VoltieAPI';
import VoltieAPIError from '../../libs/Voltie/VoltieAPIError';
import VoltieDriver, { VoltieSettings } from './driver';
import { EVSEState, StatusResponse, ConfigResponse } from '../../libs/Voltie/VoltieAPITypes';

export default class VoltieDevice extends Homey.Device {
  driver!: VoltieDriver;

  private readonly MAX_API_RETRIES = 60;
  private readonly FAST_POLLING_INTERVAL = 3000;
  private readonly SLOW_POLLING_INTERVAL = 9000;

  private api!: VoltieAPI;
  private apiError: number = 0;
  private pollingTimer: NodeJS.Timeout | null = null;

  private latest: {
    status: StatusResponse | null;
    config: ConfigResponse | null;
  } = { status: null, config: null };

  // Device lifecycle methods
  async onInit(): Promise<void> {
    this.log('VoltieDevice has been initialized');

    this.registerCapabilityListener('evcharger_charging', this.onEVChargerChargingChanged.bind(this));
    this.registerCapabilityListener('autostart', this.onAutostartChanged.bind(this));
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
    if (this.api) await this.api.destroy();
  }

  // Device capability listeners
  onEVChargerChargingChanged(value: boolean): void {
    this.log('Charging changed:', value);

    if(!this.latest.status?.is_car_connected) {
      throw new Error('Car is not connected');
    }

    (value ? this.api.startCharging() : this.api.stopCharging()).then(() => {
      this.log('Charging control request completed successfully');
      this.pollLatest(1000);
    }).catch((error) => {
      if (error.code === 'REQUEST_ABORTED') {
        this.log('Charging control request was aborted');
        return;
      }

      this.error('Failed to control charging:', error);
      throw error;
    });
  }

  onAutostartChanged(value: boolean): void {
    this.log('Autostart changed:', value);

    this.api.updateConfiguration({ conf_autostart_enabled: typeof value !== 'boolean' ? value === 'true' : value })
      .then(() => {
        this.log('Autostart updated successfully');
        this.pollLatest(1000);
      })
      .catch((error) => {
        if (error.code === 'REQUEST_ABORTED') {
          this.log('Autostart update request was aborted');
          return;  
        }

        this.error('Failed to set autostart:', error);
        throw error;
      });
  }

  onCurrentLimitChanged(value: string): void {
    this.log('Current limit changed:', parseInt(value, 10));

    this.api.updateConfiguration({ conf_current_limit: parseInt(value, 10) }).then(() => {
      this.log('Current limit updated successfully');
      this.pollLatest(1000);
    }).catch((error) => {
      if (error.code === 'REQUEST_ABORTED') {
        this.log('Current limit update request was aborted');
        return;
      }

      this.error('Failed to set current limit:', error);
      throw error;
    });
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
    
    this.setMaxCurrentLimit(newSettings.maxCurrentLimit);
    
    this.pollLatest();
  }

  private async pollLatest(delay: number = 0): Promise<void> {
    this.stopPolling();

    if(delay) await new Promise(resolve => this.pollingTimer = this.homey.setTimeout(resolve, delay));

    try {
      this.latest.status = await this.api.getStatus();
      this.latest.config = await this.api.getConfiguration();
      
      this.apiError = 0;
      if(!this.getAvailable()) await this.setAvailable();
    } catch (error: VoltieAPIError | any) {
      if (error.code !== 'REQUEST_ABORTED') {
        if (++this.apiError < this.MAX_API_RETRIES){
          this.log(`API error occurred (attempt ${this.apiError}/${this.MAX_API_RETRIES}):`, error);
          await this.setUnavailable(this.homey.__('device.unavailable', { error }));

          this.pollingTimer = this.homey.setTimeout(this.pollLatest.bind(this), this.FAST_POLLING_INTERVAL + this.apiError * 1000);
        } else {
          this.error(`Maximum API retry attempts reached (${this.MAX_API_RETRIES}). Stopping polling.`);
          await this.setUnavailable(this.homey.__('device.max_retries_reached'));
        }
      } else {
        this.log('Polling request was aborted');
      }

      return Promise.resolve();
    }

    this.updateCapabilitiesFromLatest();
    this.pollingTimer = this.homey.setTimeout(this.pollLatest.bind(this), this.latest.status?.is_car_connected ? this.FAST_POLLING_INTERVAL : this.SLOW_POLLING_INTERVAL);

    return Promise.resolve();
  }

  private stopPolling(): void {
    if (this.pollingTimer) this.homey.clearInterval(this.pollingTimer);
    this.pollingTimer = null;
  }

  // Helper methods
  private updateCapabilitiesFromLatest(): void {
    if(this.latest.status){
      this.updateCapabilityValue('evcharger_charging', this.latest.status.is_charging);
      this.updateCapabilityValue('evcharger_charging_state', this.getEVState(this.latest.status));
      this.updateCapabilityValue('measure_power', this.latest.status.charge_power * 1000);
      this.updateCapabilityValue('measure_current', this.latest.status.charge_current);

      if(this.latest.status.cdr) {
        this.updateCapabilityValue('meter_power', this.latest.status.cdr.chg_energy);
        this.updateCapabilityValue('charging_time', new Date(this.latest.status.cdr.chg_time * 1000).toISOString().substr(11, 8));
        this.updateCapabilityValue('phase', this.latest.status.cdr.phase);
      } else{
        this.updateCapabilityValue('meter_power', 0);
        this.updateCapabilityValue('charging_time', '00:00:00');
      }
    }
    
    if(this.latest.config) {
      this.updateCapabilityValue('autostart', !!this.latest.config.conf_autostart_enabled);
      this.updateCapabilityValue('current_limit', this.latest.config.conf_current_limit.toString());

      //this.driver.autostartTriggerCard.trigger(this, { autostart: !!this.latest.config.conf_autostart_enabled }, {}).catch(this.error);
      //this.driver.currentLimitTriggerCard.trigger(this, { current_limit: this.latest.config.conf_current_limit }, {}).catch(this.error);
    }
  }

  private updateCapabilityValue(capabilityId: string, value: any): void {
    if(this.hasCapability(capabilityId) && value !== null && value !== undefined) {
      this.setCapabilityValue(capabilityId, value).catch((error) => {
        this.error(`Failed to update capability ${capabilityId} to:`, value, error);
      });
    }
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

module.exports = VoltieDevice;