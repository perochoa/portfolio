---
title: "Automating Arch Linux Updates with systemd"
description: "A small bash script plus a systemd service and timer that keeps my Arch + KDE machine up to date, and what I'd change about it now."
pubDate: "Jun 03 2025"
updatedDate: "Oct 19 2026"
heroImage: "../../assets/arch-update.jpg"
---

I installed Arch Linux with KDE on my PC to get more comfortable with Linux, and updating it by hand every few days quickly became a chore. So I automated it: a bash script that refreshes the mirror list, upgrades the system, and cleans the package cache, run once a day by a systemd timer, with a desktop notification when it finishes.

This post walks through the setup. At the end there's a section on what I'd do differently now, because a year of working on production infrastructure changed how I think about a few of these choices.

## Dependencies

| Package | Why |
| --- | --- |
| `reflector`, `rsync` | Rank and refresh the pacman mirror list |
| `pacman-contrib` | Provides `paccache`, which prunes old cached packages |
| `libnotify` | Provides `notify-send` for desktop notifications |

```bash
sudo pacman -S reflector rsync pacman-contrib libnotify
```

## The script

I keep personal scripts in `~/scripts`:

```bash
mkdir -p ~/scripts ~/.local/logs
touch ~/scripts/arch-update.sh
chmod +x ~/scripts/arch-update.sh
```

```bash
#!/bin/bash
set -euo pipefail

LOGFILE="/home/<username>/.local/logs/arch-update.log"
mkdir -p "$(dirname "$LOGFILE")"
exec > >(tee -a "$LOGFILE") 2>&1

echo "[$(date)] Starting system update"

echo "[*] Updating mirrors"
reflector --country Canada --completion-percent 100 --latest 10 \
  --download-timeout 60 --sort rate --save /etc/pacman.d/mirrorlist

echo "[*] Upgrading packages"
pacman -Syu --noconfirm

echo "[*] Cleaning the package cache"
paccache -r

echo "[$(date)] Update complete"

# Tell the desktop session it finished.
USER_ID=$(id -u <username>)
sudo -u <username> DISPLAY=:0 \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$USER_ID/bus" \
  notify-send "System update" "Update completed!"
```

A few notes:

- `set -euo pipefail` stops the script on the first failure, so a failed mirror refresh doesn't go on to upgrade from a stale list.
- `exec > >(tee -a "$LOGFILE") 2>&1` sends everything the script prints, including errors, to both the terminal and the log file.
- `paccache -r` keeps the three most recent versions of each package and deletes the rest. Without it, `/var/cache/pacman/pkg` grows forever.
- The notification is the awkward part. The script runs as root with no desktop session, so it has to point `notify-send` at my user's D-Bus session bus and run as me.

## The service and the timer

systemd separates *what* runs (a service) from *when* it runs (a timer).

```ini
# /etc/systemd/system/arch-update.service
[Unit]
Description=Arch Linux system update

[Service]
Type=oneshot
ExecStart=/home/<username>/scripts/arch-update.sh
```

`Type=oneshot` tells systemd the script runs to completion and exits, rather than staying up as a daemon.

```ini
# /etc/systemd/system/arch-update.timer
[Unit]
Description=Run the Arch update script daily

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

`Persistent=true` matters on a desktop. If the machine was off at midnight, the job runs at the next boot instead of being skipped.

Test the service once by hand, then enable the timer:

```bash
sudo systemctl daemon-reload
sudo systemctl start arch-update.service
systemctl status arch-update.service
sudo systemctl enable --now arch-update.timer
systemctl list-timers arch-update.timer
```

## What I'd change now

This worked, but reading it a year later, a few things stand out.

**I gave away root for no reason.** The first version of this post also added a `sudoers` rule so I could run `pacman`, `paccache`, and `reflector` without a password. The timer never needed it: a system service already runs as root. And `NOPASSWD` on `pacman` is effectively passwordless root, because `pacman -U` will install any package file you hand it, including one with an install script that does whatever it wants. I've removed that step. If you added it, delete the line with `sudo visudo`.

**Unattended `-Syu --noconfirm` is a gamble on Arch.** Arch occasionally ships updates that need a manual step, announced on the [Arch news page](https://archlinux.org/news/). An unattended upgrade skips reading it. A safer version would only *check* for updates (`checkupdates`, also from `pacman-contrib`) and notify me, leaving the actual upgrade to when I'm at the keyboard. The automated part should be the reminder, not the root-level change.

**systemd already keeps the logs.** Anything a service prints goes to the journal, so `journalctl -u arch-update` shows every run with timestamps, no log file or `tee` needed. My hand-rolled log file also had no rotation.

**Add some jitter.** `RandomizedDelaySec=30m` in the timer spreads the run out, which is kinder to mirrors when lots of machines are set to `daily`.

The general lesson, which I've since seen at a much larger scale at work: automation that changes a system should be cautious, observable, and easy to roll back. Automation that only tells you something needs attention can be as aggressive as you like.
