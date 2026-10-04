CREATE TYPE public.product_type AS ENUM ('packaged', 'loose');

CREATE TABLE public.products (
  id text PRIMARY KEY,
  name text NOT NULL,
  hindi_name text NOT NULL DEFAULT '',
  aliases text[] NOT NULL DEFAULT '{}',
  barcode text UNIQUE,
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  unit text NOT NULL,
  product_type public.product_type NOT NULL,
  image text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active products are readable" ON public.products FOR SELECT TO anon, authenticated USING (is_active = true);

INSERT INTO public.products (id, name, hindi_name, aliases, barcode, price, unit, product_type, image) VALUES
('toor','Toor Dal','तूर दाल','{toor dal,tuvar dal,arhar dal,toor,tur,arhar}',NULL,120,'kg','loose','🟡'),
('chana','Chana Dal','चना दाल','{chana dal,chana,channa,chane ki dal}',NULL,90,'kg','loose','🟠'),
('besan','Besan','बेसन','{besan,gram flour,chickpea flour}',NULL,80,'kg','loose','🌾'),
('moong','Moong Dal','मूंग दाल','{moong dal,mung,moong}',NULL,110,'kg','loose','🟢'),
('sugar','Sugar','चीनी','{sugar,chini,cheeni,shakar,shakkar}',NULL,48,'kg','loose','🧂'),
('rice','Rice','चावल','{rice,chawal,chaval}',NULL,55,'kg','loose','🍚'),
('atta','Atta','आटा','{atta,aata,wheat flour,gehu}',NULL,48,'kg','loose','🌾'),
('potato','Potato','आलू','{potato,aloo,alu}',NULL,35,'kg','loose','🥔'),
('onion','Onion','प्याज़','{onion,pyaz,pyaaz,kanda}',NULL,40,'kg','loose','🧅'),
('tomato','Tomato','टमाटर','{tomato,tamatar}',NULL,30,'kg','loose','🍅'),
('pumpkin','Pumpkin','कद्दू','{pumpkin,kaddu,sitaphal}',NULL,40,'kg','loose','🎃'),
('parleg','Parle-G','पारले-जी','{parle g,parle,biscuit}','8901719110016',5,'pkt','packaged','🍪'),
('milk','Amul Milk','अमूल दूध','{amul milk,milk,doodh,dudh,amul}','8901262010016',30,'pkt','packaged','🥛'),
('salt','Tata Salt','नमक','{tata salt,salt,namak}','8904043901015',28,'pkt','packaged','🧂'),
('maggi','Maggi','मैगी','{maggi,magi,noodles}','8901058851298',14,'pkt','packaged','🍜'),
('sunoil','Fortune Sunflower Oil','सूरजमुखी तेल','{sunflower oil,fortune,refined,tel}','8906007280013',150,'L','packaged','🌻'),
('mustard','Mustard Oil','सरसों तेल','{mustard oil,sarson,sarso ka tel,tel}','8901030750021',170,'L','packaged','🫒'),
('soyoil','Soybean Oil','सोयाबीन तेल','{soybean oil,soya oil,soya,tel}','8901030750038',140,'L','packaged','🫘'),
('groundnut','Groundnut Oil','मूंगफली तेल','{groundnut oil,moongfali,peanut oil,tel}','8901030750045',190,'L','packaged','🥜'),
('tea','Tata Tea Premium 250g','चाय','{tata tea,tea,chai,chai patti}','8901052002013',140,'pkt','packaged','🍵'),
('surf','Surf Excel 500g','सर्फ़','{surf excel,surf,detergent,washing powder}','8901030865237',75,'pkt','packaged','🧼'),
('bread','Bread','ब्रेड','{bread,double roti,pav}','8906010500016',40,'pkt','packaged','🍞');