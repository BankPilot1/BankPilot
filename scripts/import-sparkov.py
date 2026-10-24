"""Stream official Sparkov archive; build reproducible, provenance-preserving demo slice."""
import argparse
import calendar
import csv
import hashlib
import io
import json
import zipfile
from collections import defaultdict, Counter
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = {'entertainment':'休闲娱乐','food_dining':'餐饮美食','gas_transport':'交通出行','grocery_net':'生鲜食品','grocery_pos':'生鲜食品','health_fitness':'医疗健康','home':'家居生活','kids_pets':'亲子宠物','misc_net':'其他消费','misc_pos':'其他消费','personal_care':'个人护理','shopping_net':'网络购物','shopping_pos':'线下购物','travel':'旅行住宿'}

def rows(archive):
    with archive.open('fraudTest.csv') as stream:
        yield from csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8'))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--date', default=datetime.now(timezone(timedelta(hours=8))).date().isoformat())
    parser.add_argument('--factor', default='7.00', help='Demo denomination factor, NOT live FX')
    args = parser.parse_args()
    target = datetime.fromisoformat(args.date)
    factor = Decimal(args.factor)
    if factor <= 0: raise ValueError('factor must be positive')
    archive_path = ROOT / 'data/raw/sparkov/sparkov.zip'
    stats = defaultdict(Counter)
    with zipfile.ZipFile(archive_path) as archive:
        for row in rows(archive):
            period = row['trans_date_trans_time'][:7]
            if '2020-07' <= period <= '2020-12': stats[row['cc_num']][period] += 1
        candidates = [card for card, counts in stats.items() if len(counts) == 6]
        candidates.sort(key=lambda card: (abs(sum(stats[card].values())-400), hashlib.sha256(card.encode()).hexdigest()))
        selected = candidates[:4]
        if len(selected) != 4: raise ValueError('Not enough cards with six-month history')
        config = json.loads((ROOT / 'data/demo-config.json').read_text(encoding='utf-8'))
        mapping = dict(zip(selected, [a['id'] for a in config['accounts']]))
        output, labels, seen = [], {}, set()
        for row in rows(archive):
            original_date = row['trans_date_trans_time']
            if row['cc_num'] not in mapping or not '2020-07' <= original_date[:7] <= '2020-12': continue
            source_date = datetime.strptime(original_date, '%Y-%m-%d %H:%M:%S')
            shifted_month = target.year*12+target.month-1 + source_date.month-12
            year, m0 = divmod(shifted_month,12)
            shifted = source_date.replace(year=year, month=m0+1, day=min(source_date.day,calendar.monthrange(year,m0+1)[1]))
            if shifted.date() > target.date(): continue
            original_amount = Decimal(row['amt'])
            if original_amount <= 0: raise ValueError('Non-positive purchase amount')
            source_id = row['trans_num']
            if source_id in seen: raise ValueError('Duplicate source transaction')
            seen.add(source_id)
            tx_id = 'sparkov-' + source_id
            output.append({'id':tx_id,'accountId':mapping[row['cc_num']], 'merchant':row['merchant'].removeprefix('fraud_'), 'category':CATEGORIES[row['category']], 'amount':-float((original_amount*factor).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)), 'date':shifted.isoformat()+'+08:00', 'kind':'expense','currency':'CNY','source':'sparkov','sourceRecordId':source_id,'originalDate':original_date,'originalAmount':float(original_amount),'originalCurrency':'USD','originalCategory':row['category']})
            labels[tx_id] = int(row['is_fraud'])
    output.sort(key=lambda t:t['date'],reverse=True)
    metadata = {'id':'sparkov-v1','name':'Sparkov 合成信用卡交易','url':'https://www.kaggle.com/datasets/kartik2112/fraud-detection','synthetic':True,'referenceDate':args.date,'sourceFile':'fraudTest.csv','sourcePeriod':'2020-07 至 2020-12','rows':len(output),'archiveSha256':hashlib.file_digest(archive_path.open('rb'),'sha256').hexdigest(),'demoAmountFactor':str(factor),'currency':'CNY','note':'四个不同来源卡片组合映射为虚构用户的四个模拟账户；原交易美元金额乘固定演示因子，非实时汇率；日期按月平移至演示期，原时间无明确时区，演示按上海时区解释；移除商户名 fraud_ 统一前缀（不代表欺诈标签）；余额、账单与代扣为额外模拟业务。','accounts':[{'accountId':mapping[card],'sourceCardHash':hashlib.sha256(card.encode()).hexdigest()[:16],'rows':sum(t['accountId']==mapping[card] for t in output)} for card in selected]}
    dest = ROOT / 'data/processed'; dest.mkdir(parents=True,exist_ok=True)
    (dest/'sparkov.json').write_text(json.dumps({'metadata':metadata,'transactions':output},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (dest/'sparkov-evaluation.json').write_text(json.dumps(labels,separators=(',',':')),encoding='utf-8')
    print(json.dumps(metadata,ensure_ascii=False,indent=2))

if __name__ == '__main__': main()
