Module.register("MMM-HallSensor", {
    defaults: {
        pin: 17,
        gpioChip: 0,
        debounceSec: 0.5,
        pollInterval: 0.005,
        gpioRestartDelay: 5000,
        mqttEnabled: true,
        mqttBroker: "mqtt://localhost:1883",
        mqttSubscribeTopic: "mm/hall/enabled",
        mqttPublishTopic: "mm/dial/connected",
        sensorConfigPath: null,
        invertLogic: false
    },

    start: function () {
        Log.info("[MMM-HallSensor] Starting - Dial detection on pin " + this.config.pin);
        this.dialConnected = false;
        this.sendSocketNotification("INIT_GPIO", this.config);
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "DIAL_STATE") {
            var wasConnected = this.dialConnected;
            this.dialConnected = payload.connected;

            if (this.dialConnected !== wasConnected) {
                Log.info("[MMM-HallSensor] Dial " + (this.dialConnected ? "CONNECTED" : "DISCONNECTED"));

                // Broadcast to all modules
                this.sendNotification("DIAL_CONNECTED", {
                    connected: this.dialConnected
                });
            }
        }
    },

    notificationReceived: function (notification, payload) {
        // Allow other modules to query dial state
        if (notification === "DIAL_STATE_REQUEST") {
            this.sendNotification("DIAL_CONNECTED", {
                connected: this.dialConnected
            });
        }
    },

    getDom: function () {
        var wrapper = document.createElement("div");
        wrapper.style.display = "none";
        return wrapper;
    }
});