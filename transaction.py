import datetime

time_now = datetime.datetime.now(datetime.timezone.utc).isoformat()

transaction1={"time": time_now,"sender":"C","receiver":"C","amount":1}

time_now = datetime.datetime.now(datetime.timezone.utc).isoformat()

transaction2={"time":time_now,"sender":"D","receiver":"E","amount":3}

transactions = [transaction1,transaction2]

print(transactions)