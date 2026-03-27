# MMM-HallSensor

A [MagicMirror](https://magicmirror.builders/) module that detects magnetic presence using a KY-003 Hall effect sensor on GPIO. When a magnet is detected, it broadcasts a `DIAL_CONNECTED` notification to all other modules.

This module is invisible — it runs in the background and provides sensor state to other modules via MagicMirror's notification system.

## How It Works

A Python process polls the GPIO pin connected to a KY-003 Hall effect sensor. When a magnet is brought near the sensor, the GPIO pin goes LOW and the module broadcasts a state change to all MagicMirror modules. Optional MQTT integration allows remote enable/disable control and state publishing to a broker.

## Hardware Requirements

- Raspberry Pi (or other SBC with GPIO and `lgpio` support)
- KY-003 Hall effect sensor module
- Python 3 with the `lgpio` library

### Wiring

```
KY-003        Raspberry Pi
------        ------------
S (Signal) -> GPIO 17 (pin 11)
+  (VCC)   -> 3.3V (pin 1)
-  (GND)   -> GND (pin 6)
```

You can use any GPIO pin — just update the `pin` option in the config.

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/jiromusik/MMM-HallSensor.git
cd MMM-HallSensor
npm install
```

Make sure the Python `lgpio` library is installed:

```bash
sudo apt install python3-lgpio
```

## Configuration

Add to your `config/config.js`:

```javascript
{
    module: "MMM-HallSensor",
    config: {
        // All options are optional — defaults work out of the box
    }
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pin` | Number | `17` | GPIO pin number connected to sensor signal |
| `gpioChip` | Number | `0` | GPIO chip number (`0` for Raspberry Pi) |
| `debounceSec` | Number | `0.5` | Debounce interval in seconds to filter noise |
| `pollInterval` | Number | `0.005` | GPIO poll interval in seconds |
| `gpioRestartDelay` | Number | `5000` | Delay in ms before restarting GPIO watcher after a crash |
| `mqttEnabled` | Boolean | `true` | Enable MQTT integration |
| `mqttBroker` | String | `"mqtt://localhost:1883"` | MQTT broker URL |
| `mqttSubscribeTopic` | String | `"mm/hall/enabled"` | MQTT topic to receive enable/disable commands |
| `mqttPublishTopic` | String | `"mm/dial/connected"` | MQTT topic to publish connection state |
| `sensorConfigPath` | String | `null` | Path to external sensor config JSON. `null` means sensor is always active |
| `invertLogic` | Boolean | `false` | Invert GPIO logic for active-high sensors. Default (false) = LOW means connected |

### Example: Custom Pin, No MQTT

```javascript
{
    module: "MMM-HallSensor",
    config: {
        pin: 27,
        mqttEnabled: false
    }
}
```

## Notifications

### Sent

| Notification | Payload | Description |
|-------------|---------|-------------|
| `DIAL_CONNECTED` | `{ connected: true/false }` | Broadcast to all modules when magnet state changes |

### Received

| Notification | Payload | Description |
|-------------|---------|-------------|
| `DIAL_STATE_REQUEST` | — | Respond with current `DIAL_CONNECTED` state |

### Using in Other Modules

```javascript
notificationReceived: function (notification, payload) {
    if (notification === "DIAL_CONNECTED") {
        if (payload.connected) {
            // Magnet detected — dial placed on sensor
        } else {
            // Magnet removed — dial lifted
        }
    }
}
```

To query the current state at any time:

```javascript
this.sendNotification("DIAL_STATE_REQUEST");
```

## MQTT Integration

When `mqttEnabled` is `true`, the module connects to the configured MQTT broker.

### Remote Enable/Disable

Publish to the subscribe topic (default `mm/hall/enabled`):

```json
{ "enabled": false }
```

This stops the GPIO watcher and reports the sensor as disconnected. Send `{ "enabled": true }` to re-enable.

### State Publishing

On each state change, the module publishes to the publish topic (default `mm/dial/connected`):

```json
{ "connected": true, "timestamp": "2026-01-15T10:30:00.000Z" }
```

If no MQTT broker is available and `mqttEnabled` is `true`, the module logs a warning but continues to function normally without MQTT.

## External Sensor Config File

The `sensorConfigPath` option allows integration with an external config file that controls whether the sensor is active. When set, the module reads the JSON file and checks `sensors.hall_ky003.enabled`:

```json
{
    "sensors": {
        "hall_ky003": {
            "enabled": true
        }
    }
}
```

If the file is missing or unreadable, the sensor defaults to enabled. When `sensorConfigPath` is `null` (the default), the sensor is always active.

## Troubleshooting

**"Python error: ModuleNotFoundError: No module named 'lgpio'"**
Install the lgpio library: `sudo apt install python3-lgpio`

**"MQTT error: connect ECONNREFUSED"**
No MQTT broker is running. Either install one (`sudo apt install mosquitto`) or disable MQTT with `mqttEnabled: false`.

**"GPIO watch exited with code 1"**
The Python script failed to access GPIO. Check that your user has permission to access GPIO devices. On Raspberry Pi OS, add your user to the `gpio` group: `sudo usermod -aG gpio $USER`

**Sensor not detecting magnet**
- Verify wiring (signal pin matches your `pin` config)
- Try `invertLogic: true` if your sensor is active-high instead of active-low
- Reduce `debounceSec` if state changes are being filtered out

## License

MIT
