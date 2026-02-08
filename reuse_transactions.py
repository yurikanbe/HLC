import requests
import json

path = "http://130.211.213.169:5000/transaction_pool"
res = requests.get(path)
transactions_dict = res.json()
received_transactions = transactions_dict["transactions"][0]

res = requests.post(path,json.dumps(received_transactions))
print(res.json())