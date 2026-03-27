const NodeHelper = require("node_helper");
const { spawn } = require("child_process");
const path = require("path");
const mqtt = require("mqtt");
const fs = require("fs");

module.exports = NodeHelper.create({
    start: function () {
        this.pyProc = null;
        this.dialConnected = false;
        this.sensorEnabled = true;
        this.config = null;
        this._mqttInitialized = false;
        console.log("[MMM-HallSensor] node_helper started");
    },

    _initMQTT: function () {
        if (this._mqttInitialized) return;
        if (!this.config.mqttEnabled) {
            console.log("[MMM-HallSensor] MQTT disabled by config");
            return;
        }
        this._mqttInitialized = true;

        var self = this;
        try {
            this.mqttClient = mqtt.connect(this.config.mqttBroker);
        } catch (e) {
            console.error("[MMM-HallSensor] MQTT connection failed:", e.message);
            return;
        }

        this.mqttClient.on("error", function (err) {
            console.warn("[MMM-HallSensor] MQTT error:", err.message);
        });

        this.mqttClient.on("connect", function () {
            self.mqttClient.subscribe(self.config.mqttSubscribeTopic);
            console.log("[MMM-HallSensor] MQTT connected to " + self.config.mqttBroker);
        });

        this.mqttClient.on("message", function (topic, message) {
            if (topic === self.config.mqttSubscribeTopic) {
                try {
                    var d = JSON.parse(message.toString());
                    var enabled = d.enabled === true;
                    console.log("[MMM-HallSensor] Sensor " + (enabled ? "ENABLED" : "DISABLED") + " via MQTT");
                    if (enabled && !self.sensorEnabled) {
                        self.sensorEnabled = true;
                        if (!self.pyProc && self.config) {
                            self.startGPIO(self.config);
                        }
                    } else if (!enabled && self.sensorEnabled) {
                        self.sensorEnabled = false;
                        self._stopGPIO();
                        self.dialConnected = false;
                        self.sendSocketNotification("DIAL_STATE", { connected: false });
                        self._publishConnected(false);
                    }
                } catch (e) {
                    console.error("[MMM-HallSensor] Error parsing MQTT message:", e.message);
                }
            }
        });
    },

    _isSensorEnabled: function () {
        if (!this.config.sensorConfigPath) {
            return true;
        }
        try {
            var data = fs.readFileSync(this.config.sensorConfigPath, "utf8");
            var cfg = JSON.parse(data);
            return !!(cfg.sensors && cfg.sensors.hall_ky003 && cfg.sensors.hall_ky003.enabled);
        } catch (e) {
            return true;
        }
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "INIT_GPIO") {
            this.config = payload;
            this._initMQTT();

            if (this._isSensorEnabled()) {
                this.sensorEnabled = true;
                if (!this.pyProc) {
                    this.startGPIO(this.config);
                }
            } else {
                this.sensorEnabled = false;
                console.log("[MMM-HallSensor] Sensor disabled in config, skipping GPIO watch");
                this.sendSocketNotification("DIAL_STATE", { connected: false });
                this._publishConnected(false);
            }
        }
    },

    startGPIO: function (config) {
        var self = this;
        var scriptPath = path.join(__dirname, "gpio_watch.py");
        console.log("[MMM-HallSensor] Starting GPIO watch on pin " + config.pin);

        var args = [
            scriptPath,
            "--pin", String(config.pin),
            "--chip", String(config.gpioChip),
            "--debounce", String(config.debounceSec),
            "--poll", String(config.pollInterval)
        ];
        if (config.invertLogic) {
            args.push("--invert");
        }

        this.pyProc = spawn("python3", args, {
            stdio: ["ignore", "pipe", "pipe"]
        });

        this.pyProc.stdout.on("data", function (data) {
            var lines = data.toString().trim().split("\n");
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();

                if (line === "CONNECTED") {
                    self.dialConnected = true;
                    console.log("[MMM-HallSensor] Dial CONNECTED (magnet detected)");
                    self.sendSocketNotification("DIAL_STATE", { connected: true });
                    self._publishConnected(true);
                } else if (line === "DISCONNECTED") {
                    self.dialConnected = false;
                    console.log("[MMM-HallSensor] Dial DISCONNECTED");
                    self.sendSocketNotification("DIAL_STATE", { connected: false });
                    self._publishConnected(false);
                } else if (line.startsWith("READY")) {
                    console.log("[MMM-HallSensor] GPIO watch ready");
                }
            }
        });

        this.pyProc.stderr.on("data", function (data) {
            console.error("[MMM-HallSensor] Python error: " + data.toString().trim());
        });

        this.pyProc.on("close", function (code) {
            console.log("[MMM-HallSensor] GPIO watch exited with code " + code);
            self.pyProc = null;
            if (code !== 0 && self.sensorEnabled) {
                setTimeout(function () { self.startGPIO(config); }, self.config.gpioRestartDelay);
            }
        });
    },

    _stopGPIO: function () {
        if (this.pyProc) {
            this.pyProc.kill();
            this.pyProc = null;
            console.log("[MMM-HallSensor] GPIO watch stopped");
        }
    },

    _publishConnected: function (connected) {
        if (this.mqttClient && this.mqttClient.connected) {
            this.mqttClient.publish(this.config.mqttPublishTopic,
                JSON.stringify({ connected: connected, timestamp: new Date().toISOString() }),
                { retain: false }
            );
        }
    },

    stop: function () {
        this._stopGPIO();
        if (this.mqttClient) {
            this._publishConnected(false);
            this.mqttClient.end();
        }
    }
});
