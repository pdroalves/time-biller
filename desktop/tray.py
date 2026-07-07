from __future__ import annotations

import gi

gi.require_version("Gtk", "3.0")
# Prefer the modern Ayatana indicator (Ubuntu 20.04+), fall back to the
# legacy libappindicator where only that is available.
try:
    gi.require_version("AyatanaAppIndicator3", "0.1")
    from gi.repository import AyatanaAppIndicator3 as AppIndicator3  # noqa: E402
except (ValueError, ImportError):
    gi.require_version("AppIndicator3", "0.1")
    from gi.repository import AppIndicator3  # noqa: E402

from gi.repository import GLib, Gtk  # noqa: E402

import tray_api as apiclient  # noqa: E402


def _fmt(seconds: int) -> str:
    s = max(0, int(seconds))
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


class Tray:
    def __init__(self) -> None:
        self.indicator = AppIndicator3.Indicator.new(
            "time-biller", "clock",
            AppIndicator3.IndicatorCategory.APPLICATION_STATUS)
        self.indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
        self.rebuild()
        GLib.timeout_add_seconds(5, self._tick)

    def _tick(self) -> bool:
        self.rebuild()
        return True

    def rebuild(self) -> None:
        menu = Gtk.Menu()
        try:
            entries = apiclient.running() or []
        except Exception:
            entries = []
            item = Gtk.MenuItem(label="(server unavailable)")
            item.set_sensitive(False)
            menu.append(item)

        for e in entries:
            label = f"{_fmt(e['duration_seconds'])}  {e['description'] or 'Untitled'}"
            header = Gtk.MenuItem(label=label)
            header.set_sensitive(False)
            menu.append(header)
            if e["status"] == "running":
                mi = Gtk.MenuItem(label="   Pause")
                mi.connect("activate", self._wrap(apiclient.pause, e["id"]))
            else:
                mi = Gtk.MenuItem(label="   Resume")
                mi.connect("activate", self._wrap(apiclient.resume, e["id"]))
            menu.append(mi)
            stop_item = Gtk.MenuItem(label="   Stop")
            stop_item.connect("activate", self._wrap(apiclient.stop, e["id"]))
            menu.append(stop_item)

        menu.append(Gtk.SeparatorMenuItem())
        quick = Gtk.MenuItem(label="Quick start")
        quick.set_submenu(self._quick_menu())
        menu.append(quick)

        open_item = Gtk.MenuItem(label="Open app")
        open_item.connect("activate", lambda _:
                          GLib.spawn_command_line_async(f"xdg-open {apiclient.ROOT_URL}/"))
        menu.append(open_item)

        quit_item = Gtk.MenuItem(label="Quit tray")
        quit_item.connect("activate", lambda _: Gtk.main_quit())
        menu.append(quit_item)

        menu.show_all()
        self.indicator.set_menu(menu)

    def _quick_menu(self) -> Gtk.Menu:
        submenu = Gtk.Menu()
        try:
            for c in apiclient.clients() or []:
                citem = Gtk.MenuItem(label=c["name"])
                cmenu = Gtk.Menu()
                for p in apiclient.projects(c["id"]) or []:
                    pitem = Gtk.MenuItem(label=p["name"])
                    pitem.connect("activate", self._wrap(apiclient.start, p["id"]))
                    cmenu.append(pitem)
                citem.set_submenu(cmenu)
                submenu.append(citem)
        except Exception:
            err = Gtk.MenuItem(label="(unavailable)")
            err.set_sensitive(False)
            submenu.append(err)
        submenu.show_all()
        return submenu

    def _wrap(self, fn, *args):
        def handler(_menuitem):
            try:
                fn(*args)
            except Exception:
                pass
            self.rebuild()
        return handler


def main() -> None:
    Tray()
    Gtk.main()


if __name__ == "__main__":
    main()
