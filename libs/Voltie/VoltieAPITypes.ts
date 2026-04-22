export enum EVSEState {
  UNKNOWN = 0,
  NOT_CONNECTED = 1,
  CONNECTED_NOT_CHARGING = 2,
  CONNECTED_CHARGING_READY = 3,
  CONNECTED_CHARGING_WITH_VENTILATION = 4,
  FAULT_ON_EV_SIDE = 13,
  PHASE_MISCONNECTED = 15,
}

export enum ErrorCode {
  SUCCESS = 0,
  INTERNAL_ERROR = 1,
  INCORRECT_MESSAGE_FORMAT = 5,
}

export enum CDRPeriodStartMode {
  AUTOMATIC_ON_CONNECT = 0,
  MANUAL_START = 1,
  SCHEDULED_START = 2,
  RESERVED = 3,
  POWER_SHARING_START = 4,
  AUTOMATIC_RESUME = 5,
  HTTP_API_CALL = 6,
}

export enum CDRPeriodStopEvent {
  NOT_STOPPED_ACTIVE = 0,
  UNKNOWN_REASON = 1,
  REACHED_PRESET_DURATION = 2,
  REACHED_PRESET_ENERGY = 3,
  STOPPED_BY_USER = 4,
  CABLE_PULLOUT = 10,
  EV_FULLY_CHARGED = 11,
  SERVER_SIDE_INTERRUPTION = 23,
  POWER_OUTAGE = 31,
  HTTP_API_CALL = 32,
}

export interface ApiVersionResponse {
  api_files_version: number;
  response_time_ms: number;
  error_code: ErrorCode;
}

export interface CDRPeriod {
  index: number;
  p_start: number;
  p_stmode: CDRPeriodStartMode;
  p_energy: number;
  p_end?: number;
  p_stop_ev?: CDRPeriodStopEvent;
}

export interface ChargeDetailRecord {
  cdr_id: number;
  cdr_ver: number;
  s_start: number;
  charger_id: string;
  chg_energy: number;
  chg_time: number;
  idle_time: number;
  avg_power: number;
  phase: number;
  sw_ver: number;
  fw_ver: number;
  idtag?: string;
  idtag_name?: string;
  last_update: number;
  periods: CDRPeriod[];
  s_end?: number;
  closed_after_restart?: boolean;
  invalid?: boolean;
}

export interface PowerStatus {
  current1: number;
  current2: number;
  current3: number;
  power1: number;
  power2: number;
  power3: number;
  voltage1: number;
  voltage2: number;
  voltage3: number;
  dlm_valid: boolean;
  dlm_current1: number;
  dlm_current2: number;
  dlm_current3: number;
  ipm_valid: boolean;
  ipm_current1: number;
  ipm_current2: number;
  ipm_current3: number;
}

export interface PowerResponse {
  power_stat: PowerStatus;
  response_time_ms: number;
  error_code: ErrorCode;
}

export interface StatusResponse {
  charger_id: string;
  system_time: number;
  sw_ver: number;
  fw_ver: number;
  evse_state: EVSEState;
  is_car_connected: boolean;
  charge_enabled: boolean;
  is_charging: boolean;
  autostart: boolean;
  mains_voltage: number;
  phases: number;
  current_offered: number;
  charge_current: number;
  charge_power: number;
  first_cdr: number;
  last_cdr: number;
  cdr: ChargeDetailRecord | null;
  response_time_ms: number;
  error_code: ErrorCode;
}

export interface StartChargingParams {
  id_tag?: string;
  name?: string;
}

export interface StartChargingResponse {
  charger_id: string;
  system_time: number;
  sw_ver: number;
  fw_ver: number;
  evse_state: EVSEState;
  is_car_connected: boolean;
  charge_enabled: boolean;
  is_charging: boolean;
  cdr_id: number;
  response_time_ms: number;
  error_code: ErrorCode;
}

export interface StopChargingResponse {
  charger_id: string;
  system_time: number;
  sw_ver: number;
  fw_ver: number;
  evse_state: EVSEState;
  is_car_connected: boolean;
  charge_enabled: boolean;
  is_charging: boolean;
  cdr: ChargeDetailRecord;
  response_time_ms: number;
  error_code: ErrorCode;
}

export interface GetCDRResponse {
  charger_id: string;
  system_time: number;
  sw_ver: number;
  fw_ver: number;
  evse_state: EVSEState;
  is_car_connected: boolean;
  charge_enabled: boolean;
  is_charging: boolean;
  cdr: ChargeDetailRecord;
  response_time_ms: number;
  error_code: ErrorCode;
}

export interface ConfigResponse {
  conf_autostart_enabled: boolean;
  conf_current_limit: number;
  conf_disp_enabled: boolean;
  conf_front_led_enabled: boolean;
  conf_rear_led_enabled: boolean;
  conf_buzzer_enabled: boolean;
  response_time_ms: number;
  error_code: ErrorCode;
}

export interface ConfigRequest {
  conf_autostart_enabled?: boolean;
  conf_current_limit?: number;
  conf_disp_enabled?: boolean;
  conf_front_led_enabled?: boolean;
  conf_rear_led_enabled?: boolean;
  conf_buzzer_enabled?: boolean;
}

export interface ConfigUpdateResponse {
  accepted: number;
  response_time_ms: number;
  error_code: ErrorCode;
}

export interface VoltieAPIConfig {
  ip: string;
  port?: number;
  timeout?: number;
  username?: string | undefined | null;
  password?: string | undefined | null;
}
