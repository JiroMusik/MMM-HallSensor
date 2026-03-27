#!/usr/bin/env python3
"""Watch GPIO hall sensor for magnet presence.
KY-003 default: LOW (0) = magnet detected = connected
                HIGH (1) = no magnet = disconnected
Use --invert for active-high sensors."""
import argparse, lgpio, time, sys

parser = argparse.ArgumentParser(description="GPIO Hall sensor watcher")
parser.add_argument("--pin", type=int, default=17, help="GPIO pin number")
parser.add_argument("--chip", type=int, default=0, help="GPIO chip number")
parser.add_argument("--debounce", type=float, default=0.5, help="Debounce interval in seconds")
parser.add_argument("--poll", type=float, default=0.005, help="Poll interval in seconds")
parser.add_argument("--invert", action="store_true", help="Invert logic (HIGH = connected)")
args = parser.parse_args()

h = lgpio.gpiochip_open(args.chip)
lgpio.gpio_claim_input(h, args.pin)

value = lgpio.gpio_read(h, args.pin)
connected = (value == 1) if args.invert else (value == 0)
last_change = 0

sys.stdout.write(f"READY pin={args.pin}\n")
sys.stdout.flush()

state = "CONNECTED" if connected else "DISCONNECTED"
sys.stdout.write(f"{state}\n")
sys.stdout.flush()

try:
    while True:
        value = lgpio.gpio_read(h, args.pin)
        new_connected = (value == 1) if args.invert else (value == 0)
        if new_connected != connected:
            now = time.monotonic()
            if now - last_change >= args.debounce:
                last_change = now
                connected = new_connected
                state = "CONNECTED" if connected else "DISCONNECTED"
                sys.stdout.write(f"{state}\n")
                sys.stdout.flush()
        time.sleep(args.poll)
except KeyboardInterrupt:
    pass
finally:
    lgpio.gpiochip_close(h)
