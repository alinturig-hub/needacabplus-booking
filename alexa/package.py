"""Build a dependency-free Lambda zip; skill IDs are public identifiers."""
import argparse,json,re,zipfile
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--skill-id',required=True);parser.add_argument('--output',default='alexa-lambda.zip');parser.add_argument('--format',choices=['lambda','alexa-hosted'],default='lambda');args=parser.parse_args()
if not re.fullmatch(r'amzn1\.ask\.skill\.[A-Za-z0-9-]+',args.skill_id):parser.error('Use the exact skill ID from Amazon Developer Console.')
root=Path(__file__).resolve().parent
prefix='lambda/' if args.format=='alexa-hosted' else ''
code=(root/'lambda'/'index.js').read_text()
code,count=re.subn(r"const DEFAULT_SKILL_ID = '[^']*';", "const DEFAULT_SKILL_ID = '"+args.skill_id+"';",code,count=1)
if count!=1:raise RuntimeError('Expected exactly one public skill ID binding.')
with zipfile.ZipFile(args.output,'w',zipfile.ZIP_DEFLATED) as archive:
 if prefix:archive.writestr(prefix,'')
 archive.writestr(prefix+'index.js',code)
 archive.write(root/'lambda'/'package.json',prefix+'package.json')
 archive.writestr(prefix+'skill-config.json',json.dumps({'skillId':args.skill_id}))
print(args.output)
