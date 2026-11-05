/** Prepare a source-free, credential-free artifact test context. No image build or runtime calls. */
import {build} from 'esbuild';
import {mkdtemp,mkdir,copyFile,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const crm=process.env.TAXICRM_CHECKOUT;if(!crm)throw Error('TAXICRM_CHECKOUT_REQUIRED');
const root=await mkdtemp(join(tmpdir(),'notification-tool-artifacts-'));
await mkdir(join(root,'fixtures'));
await cp('dist/notification-tools',join(root,'nac'),{recursive:true});
await cp(join(resolve(crm),'dist/notification-tools'),join(root,'crm'),{recursive:true});
const files={
 'schema.sql':'staging/notifications/full/schema.sql',
 'shared.sql':'scripts/migrations/20261104_whatsapp_shared.sql',
 'controlled.sql':'scripts/migrations/20261105_controlled_booking_confirmed.sql',
 'outbound.sql':join(crm,'prisma/migrations/20261103000000_whatsapp_outbound/migration.sql'),
 'webhook.sql':join(crm,'prisma/migrations/20261102000000_whatsapp_webhook_inbox/migration.sql'),
 'dispatch.sql':join(crm,'prisma/migrations/20261105090000_controlled_booking_confirmed/migration.sql'),
 'template.json':'staging/notifications/controlled/template.fixture.json',
};
for(const [name,source] of Object.entries(files))await copyFile(source,join(root,'fixtures',name));
await copyFile('staging/notifications/controlled/runtime-tools.Dockerfile',join(root,'Dockerfile'));
await build({entryPoints:['staging/notifications/controlled/runtime-tools-check.ts'],outfile:join(root,'check.mjs'),bundle:true,platform:'node',target:'node22',format:'esm',external:['pg-native'],banner:{js:'import {createRequire as toolCreateRequire} from "node:module"; const require=toolCreateRequire(import.meta.url);'},logLevel:'warning'});
console.log(root);
