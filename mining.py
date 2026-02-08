import blockchain
import requests
import sys
import json
import node_list
import concurrent.futures

def http_get(path):
    res = requests.get(path)
    if res.status_code != 200:
        print("http request error")
        sys.exit()
    return res

if __name__=="__main__":
    miner="29fb7e4bd445401da7b2ace0affb97d443946304acf2d4c4886f93ebfd120c03a9b145c85d64953fedac37b81fe8f6e19a22cc286f6d3df949df4f7c9b01c68b"#Aさん
    # miner="2054c535b46f5a8526d3940b19754d76c39a4bee44563ad24ca6848e88245825ecd45aaa05e8080e3cf2ae3811a4efca57e09ab2eb488f1b044210059591cd08"#Cさん
    # miner="3dff63e15d388046bd1fae2edc3b82ebc9054243bc214c510f14b2917452e1f07de1ee87bc076bfa0dfea1c88bd1eef6b059c4655f1dd4238f2d42a59abf96fa"#Dさん
    ip_address="130.211.213.169"
    blockchain = blockchain.BlockChain()

    with concurrent.futures.ThreadPoolExecutor() as executor:
        future_to_node = {executor.submit(requests.get,"http://"+node+":8000/chain") for node in node_list.Node_List}
        max_chain_len = 0
        for future in concurrent.futures.as_completed(future_to_node):
            node = future_to_node[future]
            try:
                temp_dict = future.result().json()
                if blockchain.verify_chain(temp_dict):
                    if max_chain_len < len(temp_dict["blocks"]):
                        chain_dict = temp_dict
                        ip_address = node
                        max_chain_len = len(temp_dict["blocks"])
            except Exception as exc:
                print("%s generated an exception: %s" % (node, exc))
    print("%s is selected .block length = %d" %(ip_address,len(chain_dict["blocks"])))






    res = http_get("http://"+ip_address+":8000/chain")
    chain_dict = res.json()
    blockchain.chain = chain_dict
    blockchain.set_all_block_transactions()

    res = http_get("http://"+ip_address+":8000/transaction_pool")
    transaction_dict = res.json()
    transactions = transaction_dict["transactions"]
    transactions_copy = transactions.copy()

    all_block_transactions_copy = blockchain.all_block_transactions.copy()
    for transaction in transactions_copy:
        if (transaction not in all_block_transactions_copy) and blockchain.verify_transaction(transaction):
            all_block_transactions_copy.append(transaction)
        else:
            transactions.remove(transaction) 
    

    transactions_copy = transactions.copy()
    all_block_transactions_copy = blockchain.all_block_transactions.copy()
    for transaction in transactions_copy:
        all_block_transactions_copy.append(transaction)
        if min(blockchain.account_calc(all_block_transactions_copy).values()) < 0:
            transactions.remove(transaction)
            all_block_transactions_copy.remove(transaction)

    blockchain.transaction_pool["transactions"] = transactions

    blockchain.create_new_block(miner)
    
    with concurrent.futures.ThreadPoolExecutor() as executor:
        future_to_node ={executor.submit(requests.post,"http://"+node+":8000/chain",json=blockchain.chain) for node in node_list.Node_List}
        for future in concurrent.futures.as_completed(future_to_node):
            node = future_to_node[future]
            try:
                print(node+":"+future.result().text)
            except Exception as exc:
                print("%s generated an exception: %s" % (node, exc))




