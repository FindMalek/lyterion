"""Replace every tag on one audio file. Input on stdin: {"path", "tags": {KEY: [values]}, "cover": path|null}."""
import base64
import json
import sys

import mutagen
from mutagen.easyid3 import EasyID3
from mutagen.flac import FLAC, Picture
from mutagen.id3 import APIC, ID3, TXXX
from mutagen.mp4 import MP4, MP4Cover, MP4FreeForm

MP4_ATOMS = {
    "TITLE": "\xa9nam",
    "ARTIST": "\xa9ART",
    "ALBUM": "\xa9alb",
    "ALBUMARTIST": "aART",
    "DATE": "\xa9day",
    "GENRE": "\xa9gen",
}


def picture(cover_path):
    pic = Picture()
    pic.type = 3
    pic.mime = "image/jpeg"
    with open(cover_path, "rb") as fh:
        pic.data = fh.read()
    return pic


def write_vorbis(audio, tags, cover):
    audio.delete()
    if isinstance(audio, FLAC):
        audio.clear_pictures()
    for key, values in tags.items():
        audio[key] = values
    if cover:
        pic = picture(cover)
        if isinstance(audio, FLAC):
            audio.add_picture(pic)
        else:
            audio["METADATA_BLOCK_PICTURE"] = [base64.b64encode(pic.write()).decode("ascii")]
    audio.save()


def write_id3(path, tags, cover):
    try:
        ID3(path).delete()
    except mutagen.id3.ID3NoHeaderError:
        pass
    tags = dict(tags)
    for number, total in (("TRACKNUMBER", "TRACKTOTAL"), ("DISCNUMBER", "DISCTOTAL")):
        if number in tags and total in tags:
            tags[number] = [f"{tags[number][0]}/{tags.pop(total)[0]}"]
    easy = EasyID3()
    extra = {}
    for key, values in tags.items():
        lower = key.lower()
        if lower in EasyID3.valid_keys:
            easy[lower] = values
        else:
            extra[key] = values
    easy.save(path)
    id3 = ID3(path)
    for key, values in extra.items():
        id3.add(TXXX(encoding=3, desc=key, text=values))
    if cover:
        with open(cover, "rb") as fh:
            id3.add(APIC(encoding=3, mime="image/jpeg", type=3, desc="Cover", data=fh.read()))
    id3.save(path, v2_version=4)


def write_mp4(audio, tags, cover):
    audio.delete()
    audio.tags = audio.tags or mutagen.mp4.MP4Tags()
    track, total = tags.pop("TRACKNUMBER", ["0"])[0], tags.pop("TRACKTOTAL", ["0"])[0]
    disc, discs = tags.pop("DISCNUMBER", ["0"])[0], tags.pop("DISCTOTAL", ["0"])[0]
    audio.tags["trkn"] = [(int(track), int(total))]
    audio.tags["disk"] = [(int(disc), int(discs))]
    if tags.pop("COMPILATION", ["0"])[0] == "1":
        audio.tags["cpil"] = True
    for key, values in tags.items():
        if key in MP4_ATOMS:
            audio.tags[MP4_ATOMS[key]] = values
        else:
            audio.tags[f"----:com.apple.iTunes:{key}"] = [MP4FreeForm(v.encode("utf-8")) for v in values]
    if cover:
        with open(cover, "rb") as fh:
            audio.tags["covr"] = [MP4Cover(fh.read(), imageformat=MP4Cover.FORMAT_JPEG)]
    audio.save()


def main():
    spec = json.load(sys.stdin)
    path, tags, cover = spec["path"], spec["tags"], spec.get("cover")
    audio = mutagen.File(path)
    if audio is None:
        raise SystemExit(f"unsupported file: {path}")
    if isinstance(audio, MP4):
        write_mp4(audio, dict(tags), cover)
    elif type(audio).__name__ in ("MP3", "EasyMP3"):
        write_id3(path, tags, cover)
    else:
        write_vorbis(audio, tags, cover)
    json.dump({"ok": True}, sys.stdout)


if __name__ == "__main__":
    main()
