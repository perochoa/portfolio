---
title: "Automating Arch Linux Updates with systemd"
description: "A small bash script plus a systemd service and timer that keeps my Arch + KDE machine up to date and notifies me when it's done."
pubDate: "Jun 03 2025"
heroImage: "../../assets/arch-update.jpg"
---

## Context
I recently installed Arch Linux with KDE on my PC, as I wanted to develop my skills as an actual developer. Manually updating my system every few days started to feel like a chore. I decided to automate my system updates to streamline maintenance and ensure my system stays up-to-date.

---
## Dependencies

This is a list of the dependencies I had to manually install with `sudo pacman -S ...` to get my script to run properly.

| Dependency          | Purpose |
| ------------------- | ------- |
| `visudo`            | Safely edit the sudoers file |
| `reflector + rsync` | Rank and refresh pacman mirrors |
| `paccache`          | Prune old cached packages (from `pacman-contrib`) |
| `notify-send`       | Desktop notifications (from `libnotify`) |

---
## Setup

## Shell-Scripting
First, I got all the scripting files/directories I needed ready. I made a designated `scripting/` directory to store the update script and any future scripts I create.

```bash
# Script Files
mkdir ~/scripts # Create a directory that houses all of my scripts
touch ~/scripts/arch-update.sh # Create the script file
chmod +x arch-update.sh # Make script executable
```

I knew that the nature of the script (system updates) would need super user privileges, so I went ahead and gave the dependencies `sudo` permissions without requiring confirmation by editing the `sudoers` file with `visudo`.

```bash
sudo visudo
```

I added the line:
`<username> ALL=(ALL) NOPASSWD: /usr/bin/pacman, /usr/bin/paccache, /usr/bin/reflector`

which allowed me to run `pacman`, `paccache`, and `reflector` commands without requiring me to enter my password.

Next, I wrote the actual script.

```bash
#!/bin/bash
set -euo pipefail

# Logging
LOGFILE="/home/<username>/.local/logs/arch-update.log"
mkdir -p "$(dirname "$LOGFILE")"
exec > >(tee -a "$LOGFILE") 2>&1

# Begin System Update
echo "[$(date)] Starting System Update..."
echo "[*] Updating Mirrors..."
reflector --country Canada --completion 100 --latest 10 --download-timeout 60 --sort rate --save /etc/pacman.d/mirrorlist
echo "[*] Running System Update"
pacman -Syu --noconfirm
echo "[*] Cleaning up old package cache..."
paccache -r
echo "[$(date)] Update Complete"

# Desktop Notification
USER_ID=$(id -u <username>)
export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$USER_ID/bus"
sudo -u <username> DISPLAY=:0 DBUS_SESSION_BUS_ADDRESS=$DBUS_SESSION_BUS_ADDRESS notify-send "System Update" "Update completed!"
```

I learned that the logging portion of the script essentially enabled this:
```plaintext
          ┌────────────┐
stdout ─▶│            │
stderr ─▶│ tee -a log │ ──▶ Terminal
          │            │ ──▶ log file
          └────────────┘
```
## Logging

I wanted to log the script to keep persisted records of what the script does, when it runs, and any errors that occur during execution for debugging purposes and so I could better understand the behavior of the script. I made sure to keep the naming of the files consistent with what I wrote in the update script.

I created a designated `logs/` directory to keep any log files for the update script and any future scripts I create.

```bash
mkdir ~/.local/logs # create a local directory for storing my log files.
touch ~/.local/logs/arch-update.log # create the log file.
chmod 664 ~/.local/logs/arch-update.log # Give owner & group rw permissions and other read-only permissions.
```

## Automated Scheduled Execution

The entire purpose of making the script was to automate any updates my system needed, so naturally I set up the required files for performing scheduled execution of the update script. I made sure to keep my naming consistent to avoid any confusion.

```bash
# Create service and timer for scheduled run:
touch /etc/systemd/system/arch-update.service # Create an 'update' Service that will execute arch-update.sh.
touch /etc/systemd/system/arch-update.timer # Create a timer to schedule when the service runs.
```

```ini
; arch-update.service

[Unit]
Description=Arch Linux System Update

[Service]
Type=oneshot
ExecStart=/home/<username>/scripts/arch-update.sh

; [Unit] marks the file as a unit.
; Description shows up in `systemctl status` and `journalctl`

; [Service] Mark this unit file as a `systemd` service
; Type Tells `systemd` that the script runs once and exits.
; ExecStart tells `systemd` the command (script) to run when this service starts.
```

I manually triggered the service to test if it worked

```bash
sudo systemctl daemon-reload # reread all unit files (Since we created I new service)
sudo systemctl start arch-update.service # Start the service
sudo systemctl status arch-update.service # Check the status.
```

Then I made the schedule/timer for the service:

```ini
; arch-update.timer
[Unit]
Description=Run Arch Update Script Daily

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target

; [Unit] marks the file as a unit.
; Description shows up in `systemctl status` and `journalctl`

; [Timer] Mark this unit file as a `systemd` scheduled execution of a service.
; OnCalendar is when to run the service.
; Persistent means that the service will run on the next boot if the scheduled time elapsed while the system was off.

; [Install] Starts the timer automatically on boot.
```

And I reloaded `systemd` to reflect my updates.
```bash
sudo systemctl daemon-reexec # Rerun `systemd`
sudo systemctl daemon-reload # Reread all the unit files
sudo systemctl enable --now arch-update.timer # Enable the schedule/timer for the service
```
