"""Inspect a local OCI export; never loads a model, contacts a service or uploads."""
import hashlib,json,os,pathlib,re,sys,tarfile

def inspect(archive, docker_info, root):
    seen={}; manifests=[]; configs=[]; layers=[]
    with tarfile.open(archive,'r') as tar:
        def data(path):
            member=tar.getmember(path)
            if not member.isfile() or member.size>1048576: raise ValueError('bounded-json-file-required')
            return tar.extractfile(member).read()
        index_bytes=data('index.json'); index=json.loads(index_bytes)
        def visit(desc,depth=0):
            if depth>3 or not re.fullmatch(r'sha256:[a-f0-9]{64}',desc['digest']):raise ValueError('invalid-descriptor')
            digest=desc['digest']; size=desc['size']
            if digest in seen:
                if seen[digest]['bytes']!=size:raise ValueError('size-conflict')
                return
            member=tar.getmember('blobs/sha256/'+digest[7:])
            if not member.isfile() or member.size!=size:raise ValueError('blob-size-mismatch')
            h=hashlib.sha256(); stream=tar.extractfile(member)
            while chunk:=stream.read(1048576):h.update(chunk)
            if 'sha256:'+h.hexdigest()!=digest:raise ValueError('blob-hash-mismatch')
            media=desc['mediaType'];seen[digest]={'digest':digest,'bytes':size,'mediaType':media}
            if 'image.index' in media or 'manifest.list' in media:
                document=json.loads(data(member.name))
                for child in document['manifests']:visit(child,depth+1)
            elif 'image.manifest' in media or 'manifest.v2' in media:
                manifests.append(digest);document=json.loads(data(member.name));visit(document['config'],depth+1)
                for child in document['layers']:visit(child,depth+1)
            elif 'image.config' in media or 'container.image' in media:
                config=json.loads(data(member.name))
                if config['architecture']!='amd64' or config['os']!='linux':raise ValueError('wrong-platform')
                configs.append(digest)
            elif 'layer.' in media or 'rootfs.diff' in media:layers.append(digest)
            else:raise ValueError('unexpected-media-type:'+media)
        if len(index['manifests'])!=1:raise ValueError('single-platform-image-required')
        visit(index['manifests'][0])
    info=json.loads(pathlib.Path(docker_info).read_text())[0]
    if len(manifests)!=1 or len(configs)!=1 or info['Id']!=configs[0] or info['Architecture']!='amd64' or info['Os']!='linux':raise ValueError('docker-oci-identity-mismatch')
    total=sum(x['bytes'] for x in seen.values())+len(index_bytes)
    if total>2147483648 or info['Size']>16000000000:raise ValueError('proposed-size-bound-exceeded')
    names=['Dockerfile.integration','inputs.lock.json','requirements.lock','recognize.py','service.py','service-guards.py','proposal.json','transcribe-defaults.json']
    return {'schema':'fia-asr-image-size-proof@1','sourceHead':os.environ.get('GITHUB_SHA'),'reviewedRuntimeHead':'9ec317b2e410b0b5d0afe4c2c6ad707f28c5ee57','imageConfigId':configs[0],'ociManifestDigest':manifests[0],'registryManifestDigest':None,'platform':'linux/amd64','dockerUncompressedImageBytes':info['Size'],'ociArchiveBytes':pathlib.Path(archive).stat().st_size,'uniqueCompressedLayerBytes':sum(seen[k]['bytes'] for k in layers),'uniqueConfigManifestLayerBytes':sum(x['bytes'] for x in seen.values()),'indexBytes':len(index_bytes),'maximumProposedUploadBytesIncludingIndex':total,'blobs':list(seen.values()),'inputFileSha256':{name:hashlib.sha256((pathlib.Path(root)/name).read_bytes()).hexdigest() for name in names},'audioSourceFetches':0,'recognitionRequests':0,'cloudflareActions':0,'limits':['OCI export is measured, not uploaded to a registry.','Only this sanitized receipt is retained; image archive remains ephemeral on CI.','This build does not establish readiness, hosted kernel enforcement or playback acceptance.']}
if __name__=='__main__':
    result=inspect(*sys.argv[1:4]);pathlib.Path(sys.argv[4]).write_text(json.dumps(result,indent=2)+'\n')
