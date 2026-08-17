# Voltie for Homey

Official Homey app for Voltie chargers, by Voltie Kft. Talks to the charger over
your LAN using its local HTTP API — no cloud account required.

> Smarter charging. Lower costs. Greener energy.

**Homey App Store:** https://homey.app/en-hu/app/eu.voltie.charger/Voltie/

Learn more about Voltie and explore our chargers at [voltie.eu](https://voltie.eu).

Using another smart home platform? Voltie also has:

- [voltie-eu/homeassistant-voltie_charger](https://github.com/voltie-eu/homeassistant-voltie_charger),
  the Home Assistant integration, with its dashboard card
  [voltie-eu/lovelace-voltie-charger-card](https://github.com/voltie-eu/lovelace-voltie-charger-card)
- [voltie-eu/homebridge-voltie-charger](https://github.com/voltie-eu/homebridge-voltie-charger),
  the verified Homebridge plugin for Apple Home

## Features

- Start and stop charging from Homey.
- Live charging power, current and energy metering.
- Registers as an **EV Charger** in Homey Energy, so charged energy flows into
  your energy reports.
- Charging current limit, auto-start, and force-single-phase controls.
- Front and rear LED toggles, plus rear LED color control from Flows.
- Show scrolling messages on the charger display from Flows.
- Active-phase count, charging state, and charging-time sensors.
- Local LAN control with automatic mDNS discovery.
- Flow cards for triggers, conditions and actions (see below).

## Requirements

- A **Homey** that runs apps locally — Homey Pro (all generations), Homey
  (Early 2016–2019), or Homey Self-Hosted Server. Not available on Homey Cloud.
- Homey firmware `v12.13.0` or newer.
- A Voltie Charger on the same LAN with the **HTTP API enabled** in the Voltie
  mobile app. If you set a username and password there, you'll need them during
  setup.

## Installation 📦

**From the [Homey App Store](https://homey.app/en-hu/app/eu.voltie.charger/Voltie/)** (recommended):

1. Open the listing above, or search for **Voltie** in the Homey app.
2. Click **Install**.

**From source** (developers), using the [Homey CLI](https://apps.developer.homey.app/):

```bash
npm install -g homey
git clone https://github.com/voltie-eu/homey-voltie_charger.git
cd homey-voltie_charger
npm install
homey login
homey app install
```

## Pairing 🔌

1. In Homey, go to **Devices → Add device → Voltie → Voltie Charger**.
2. The app discovers chargers on your LAN automatically via mDNS
   (`voltie-info._tcp`). Select your charger.
3. On the setup step, enter the **Username** and **Password** if the charger's
   HTTP API requires them; otherwise continue.

If the charger isn't discovered (mDNS is often blocked on VLAN-isolated
networks), open the device's **Settings** after pairing and set the **IP
Address** and **Port** manually.

## Capabilities

| Capability | Purpose |
| --- | --- |
| `evcharger_charging` | Start / stop charging. |
| `evcharger_charging_state` | EVSE charging state. |
| `current_limit` | Charging current limit (A). |
| `autostart` | Auto-start charging on plug-in. |
| `force_single_phase` | Force single-phase charging. |
| `front_led` / `rear_led` | Enable front / rear LEDs. |
| `active_phases` | Number of active phases. |
| `charging_time` | Elapsed charging time. |
| `meter_power` | Energy charged (kWh) — imported into Homey Energy. |
| `measure_power` | Live charging power. |
| `measure_current` | Live charging current. |

## Device settings

| Setting | Default | Description |
| --- | --- | --- |
| IP Address | — | The IP address of your Voltie charger. |
| Port | `5059` | The HTTP API port of your Voltie charger. |
| Maximum current limit | — | Upper bound for the charging current. The hardware limit overrides this if it is lower. |
| Username | — | HTTP API username (if set on the charger). |
| Password | — | HTTP API password (if set on the charger). |

## Flow cards

**When** (triggers)

- `Started charging` / `Stopped charging`.
- `The EV charger charging state changed`.
- `The power meter changed` / `The power changed` / `The electric current changed`.
- `'Current Limit' changed` — token: current limit (A).
- `'Auto Start' changed` — token: on/off.
- `'Force Single Phase' changed` — token: on/off.
- `'Front LED Enabled' changed` — token: on/off.
- `'Rear LED Enabled' changed` — token: on/off.

**And** (conditions)

- `Is charging`.
- `The EV charger charging state is ...`.
- `'Auto Start' is on/off`.
- `'Force Single Phase' is on/off`.
- `'Front LED' is on/off`.
- `'Rear LED' is on/off`.
- `Is plugged in / unplugged`.

**Then** (actions)

- `Start charging` / `Stop charging`.
- `Set 'Current Limit' to [x] A` (6–32 A).
- `Set 'Auto Start' to on/off`.
- `Set 'Force Single Phase' to on/off`.
- `Set 'Front LED' to on/off`.
- `Set 'Rear LED' to on/off`.
- `Set text on charger to [text] and repeat [1-5] times`: shows a scrolling
  message on the charger display.
- `Set rear LED brightness to [x] and color to [color] for [x] seconds`: the
  LED reverts to its default color when the duration expires (max 3600 s).
- `Reboot Charger`: full hardware reboot; the charger is unavailable for a
  short time while it restarts.

## Troubleshooting 🛠️

**Charger not discovered.** Confirm the HTTP API is enabled in the Voltie app
and that Homey and the charger are on the same LAN. If your network blocks
mDNS, set the IP address and port manually in the device settings.

**Authentication fails.** The credentials are the ones set inside the charger's
HTTP API config, not your Voltie cloud account.

**Values go unavailable.** Check that the charger is powered and reachable on
the network, and verify the IP and port in the device settings.

## Support

Found a bug or have a feature request? Open an issue on
[GitHub Issues](https://github.com/voltie-eu/homey-voltie_charger/issues).

Version history is tracked in [`.homeychangelog.json`](.homeychangelog.json)
and shown in the Homey App Store.

## License

Licensed under the **GNU General Public License v3.0**. See [LICENSE](LICENSE).
