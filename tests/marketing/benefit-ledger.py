"""Synthetic networkless disposable PostgreSQL only. No connection strings."""
import subprocess, pathlib, concurrent.futures
BASE=['docker','--host=unix:///var/run/docker.sock','exec','-i','taxicrm-benefit-synthetic','psql','-U','postgres','-v','ON_ERROR_STOP=1','-At']
def sql(s,ok=True):
 p=subprocess.run(BASE,input=s,text=True,capture_output=True)
 if ok and p.returncode: raise AssertionError(p.stderr)
 return p
sql('CREATE TABLE marketing_campaigns(id uuid PRIMARY KEY);')
sql(pathlib.Path('scripts/migrations/20261102_marketing_benefit_ledger.sql').read_text())
c='00000000-0000-0000-0000-000000000001';b='00000000-0000-0000-0000-000000000002';r='00000000-0000-0000-0000-000000000003'
sql(f"INSERT INTO marketing_campaigns VALUES('{c}'); INSERT INTO marketing_campaign_control VALUES('synthetic','{c}','synthetic-operator',now(),1,1000,0,0); INSERT INTO marketing_benefit_grants VALUES('synthetic','{c}','{b}','{c}',true,'active',now()-interval '1 day',now()+interval '1 day',1,0,0);")
def reserve(channel,key,rid=r,amount=500):return f"SELECT reserve_marketing_benefit('synthetic','{b}','{rid}','{key}','{channel}','booking-{key}',{amount});"
with concurrent.futures.ThreadPoolExecutor(2) as pool:
 results=list(pool.map(lambda x:sql(x,False),[reserve('AUTOCAB','a'),reserve('NEEDACABPLUS','n','00000000-0000-0000-0000-000000000004')]))
assert sum(x.returncode==0 for x in results)==1
assert any('USAGE_LIMIT' in x.stderr for x in results)
row=sql('SELECT reservation_id,operation_key,channel FROM marketing_benefit_reservations;').stdout.strip().split('|');r,key,ch=row
assert sql(reserve(ch,key,r)).returncode==0
assert 'IDEMPOTENCY_CONFLICT' in sql(reserve(ch,key,r,501),False).stderr
sql(f"SELECT settle_marketing_benefit('synthetic','{r}','released'); SELECT settle_marketing_benefit('synthetic','{r}','released');")
assert sql('SELECT reserved_pence FROM marketing_campaign_control;').stdout.strip()=='0'
r2='00000000-0000-0000-0000-000000000005'
sql(reserve('AUTOCAB','second',r2));sql(f"SELECT settle_marketing_benefit('synthetic','{r2}','committed'); SELECT settle_marketing_benefit('synthetic','{r2}','committed');")
assert sql('SELECT committed_pence FROM marketing_campaign_control;').stdout.strip()=='500'
assert 'TERMINAL_RESERVATION' in sql(f"SELECT settle_marketing_benefit('synthetic','{r2}','released');",False).stderr
assert sql('SELECT count(*) FROM marketing_benefit_audit;').stdout.strip()=='4'
print('PASS: migration, cross-channel concurrency, retry, conflicting retry, release, commit, terminal protection, audit')

sql(f"UPDATE marketing_benefit_grants SET maximum_uses=2,ends_at=now()-interval '1 second',starts_at=now()-interval '2 days';")
assert 'BENEFIT_NOT_ELIGIBLE' in sql(reserve('AUTOCAB','expired'),False).stderr
sql("UPDATE marketing_benefit_grants SET ends_at=now()+interval '1 day',identity_verified=false;")
assert 'BENEFIT_NOT_ELIGIBLE' in sql(reserve('AUTOCAB','unverified'),False).stderr
sql("UPDATE marketing_benefit_grants SET identity_verified=true;")
assert 'BUDGET_LIMIT' in sql(reserve('AUTOCAB','budget',amount=501),False).stderr
assert 'BENEFIT_NOT_FOUND' in sql(reserve('AUTOCAB','tenant').replace("'synthetic'","'other'"),False).stderr
print('PASS: expiry, unverified identity, budget cap, tenant isolation')
