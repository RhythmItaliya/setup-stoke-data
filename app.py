from dhanhq import marketfeed

access_token = ""
client_id = ""

# Instruments for stock and F&O data
instruments = [
    # Stock data (example for MARUTI)
    (marketfeed.NSE, "10999", marketfeed.Full),  # Stock data for MARUTI (security ID: 10999)
    
    # F&O data (example for NIFTY Futures)
    (marketfeed.NSE_FNO, "FUTIDXNIFTY", marketfeed.Full),  # Example for NIFTY Futures (replace with actual F&O security IDs)
    
    # F&O data (example for NIFTY Option)
    (marketfeed.NSE_FNO, "OPTIDXNIFTY", marketfeed.Full)  # Example for NIFTY Option (replace with actual F&O security IDs)
]

version = "v2"

try:
    data = marketfeed.DhanFeed(client_id, access_token, instruments, version)
    
    while True:
        data.run_forever()
        response = data.get_data()
        print(response)  # Print both stock and F&O data

except Exception as e:
    print(f"Error: {e}")

finally:
    data.disconnect()
