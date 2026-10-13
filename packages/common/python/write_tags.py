"""Replace every tag on one audio file, or with "merge": true set only the given keys. Input on stdin: {"path", "tags": {KEY: [values]}, "cover": path|null, "merge": bool}."""
import base64
import json
import sys

import mutagen
from mutagen.easyid3 import EasyID3
from mutagen.flac import FLAC, Picture
from mutagen.id3 import APIC, ID3, TXXX, USLT
from mutagen.mp4 import MP4, MP4Cover, MP4FreeForm

MP4_ATOMS = {
    "TITLE": "\xa9nam",
    "ARTIST": "\xa9ART",
    "ALBUM": "\xa9alb",
    "ALBUMARTIST": "aART",
    "DATE": "\xa9day",
    "GENRE": "\xa9gen",
    "LYRICS": "\xa9lyr",
}


def add_lyrics(id3, values):
    # ID3 keeps lyrics in USLT, which Navidrome reads (synced LRC text included) and serves to Subsonic clients.
    id3.delall("USLT")
    id3.delall("TXXX:LYRICS")
    if values:
        id3.add(USLT(encoding=3, lang="eng", desc="", text=values[0]))


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
    lyrics = tags.pop("LYRICS", None)
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
    if lyrics:
        add_lyrics(id3, lyrics)
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


def merge_tags(path, audio, tags):
    if isinstance(audio, MP4):
        for key, values in tags.items():
            atom = MP4_ATOMS.get(key, f"----:com.apple.iTunes:{key}")
            audio.tags[atom] = values if key in MP4_ATOMS else [MP4FreeForm(v.encode("utf-8")) for v in values]
        audio.save()
    elif type(audio).__name__ in ("MP3", "EasyMP3"):
        id3 = ID3(path)
        for key, values in tags.items():
            if key == "LYRICS":
                add_lyrics(id3, values)
                continue
            id3.delall(f"TXXX:{key}")
            id3.add(TXXX(encoding=3, desc=key, text=values))
        id3.save(path, v2_version=4)
    else:
        for key, values in tags.items():
            audio[key] = values
        audio.save()


def main():
    spec = json.load(sys.stdin)
    path, tags, cover = spec["path"], spec["tags"], spec.get("cover")
    audio = mutagen.File(path)
    if audio is None:
        raise SystemExit(f"unsupported file: {path}")
    if spec.get("merge"):
        merge_tags(path, audio, tags)
    elif isinstance(audio, MP4):
        write_mp4(audio, dict(tags), cover)
    elif type(audio).__name__ in ("MP3", "EasyMP3"):
        write_id3(path, tags, cover)
    else:
        write_vorbis(audio, tags, cover)
    json.dump({"ok": True}, sys.stdout)


if __name__ == "__main__":
    main()
