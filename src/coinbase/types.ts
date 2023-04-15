export interface ProductsResponse {
  products: {
    product_id: string;
    price: string;
    price_percentage_change_24h: string;
    volume_24h: string;
    volume_percentage_change_24h: string;
    base_increment: string;
    quote_increment: string;
    quote_min_size: string;
    quote_max_size: string;
    base_min_size: string;
    base_max_size: string;
    base_name: string;
    quote_name: string;
    watched: boolean;
    is_disabled: boolean;
    new: boolean;
    status: string;
    cancel_only: boolean;
    limit_only: boolean;
    post_only: boolean;
    trading_disabled: boolean;
    auction_mode: boolean;
    product_type: string;
    quote_currency_id: string;
    quote_currency_symbol: string;
    base_currency_id: string;
    mid_market_price: string;
  }[];
  num_products: number;
}
