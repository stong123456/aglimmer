#!/usr/bin/env python3
"""Read-only verification of A Glimmer ZIP volumes. Never extracts files."""
import hashlib
import json
from pathlib import PurePosixPath
import re
import sys
import zipfile


def verify(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or len(names) > 2000:
            raise ValueError('Duplicate or excessive archive entries')
        if any(PurePosixPath(n).is_absolute() or '..' in PurePosixPath(n).parts or '\\' in n for n in names):
            raise ValueError('Unsafe archive path')
        info = archive.getinfo('checksums.json')
        if info.file_size > 4 * 1024 * 1024:
            raise ValueError('Checksum manifest is too large')
        manifest = json.loads(archive.read(info))
        if manifest.get('version') != 1 or manifest.get('algorithm') != 'SHA-256':
            raise ValueError('Unsupported checksum format')
        files = manifest.get('files')
        if not isinstance(files, list) or len(files) != len(names) - 1:
            raise ValueError('Incomplete checksum manifest')
        expected = {f['path'] for f in files}
        if len(expected) != len(files) or expected != set(names) - {'checksums.json'}:
            raise ValueError('Manifest and archive entries differ')
        total = 0
        for entry in files:
            size = entry.get('bytes')
            checksum = entry.get('sha256', '')
            if not isinstance(size, int) or size < 0 or not re.fullmatch('[0-9a-f]{64}', checksum):
                raise ValueError('Invalid checksum entry')
            total += size
            if total > 100 * 1024 * 1024 or archive.getinfo(entry['path']).file_size != size:
                raise ValueError('Unexpected file size')
            digest = hashlib.sha256()
            with archive.open(entry['path']) as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(chunk)
            if digest.hexdigest() != checksum:
                raise ValueError('Checksum mismatch: ' + entry['path'])
        return len(files), total


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 scripts/verify-export.py <archive.zip>')
    try:
        count, size = verify(sys.argv[1])
        print(f'PASS: {count} files, {size} bytes; every SHA-256 matches. No files extracted.')
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile, RuntimeError) as error:
        sys.exit('FAIL: ' + str(error))
