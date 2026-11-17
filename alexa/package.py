"""Build a dependency-free Lambda zip; skill IDs are public identifiers."""
import argparse,json,re,zipfile
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--skill-id',required=True);parser.add_argument('--output',default='alexa-lambda.zip');args=parser.parse_args()
if not re.fullmatch(r'amzn1\.ask\.skill\.[A-Za-z0-9-]+',args.skill_id):parser.error('Use the exact skill ID from Amazon Developer Console.')
root=Path(__file__).resolve().parent
with zipfile.ZipFile(args.output,'w',zipfile.ZIP_DEFLATED) as archive:
 for name in ['index.js','package.json']:archive.write(root/'lambda'/name,name)
 archive.writestr('skill-config.json',json.dumps({'skillId':args.skill_id}))
print(args.output)
