import {
    AppBar,
    Box,
    Button,
    Card,
    CardActionArea,
    CardActions,
    CardContent,
    Checkbox,
    Chip,
    Container,
    Dialog,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    FormGroup,
    IconButton,
    Input,
    Link,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    Stack,
    Switch,
    Toolbar,
    Typography,
} from "@mui/material";
import { Favorite, FavoriteBorder, Menu as MenuIcon, MusicNote, Person, Search } from "@mui/icons-material";
import Head from "next/head";
import { useRouter } from "next/router";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { ParsedUrlQuery } from "querystring";
import { ChangeEvent, FC, MouseEvent, useMemo, useState } from "react";
import { getBhajan, getBhajanList, IBhajan, IBhajanList } from "../lib/api";

// --- Компонент Карточки Бхаджана ---
interface IBhajanCardProps {
    bhajan: IBhajanList[number];
    isFavorite: boolean;
    onToggleFavorite: () => void;
}

const BhajanCard: FC<IBhajanCardProps> = ({ bhajan, isFavorite, onToggleFavorite }) => {
    const router = useRouter();
    return (
        <Card>
            <CardActionArea onClick={() => router.push(`/bhajan/${bhajan.id}`)}>
                <CardContent>
                    <Typography gutterBottom variant="h5" component="div">
                        {bhajan.title.ru}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {bhajan.author}
                    </Typography>
                </CardContent>
            </CardActionArea>
            <CardActions>
                <IconButton aria-label="add to favorites" onClick={onToggleFavorite}>
                    {isFavorite ? <Favorite color="error" /> : <FavoriteBorder />}
                </IconButton>
            </CardActions>
        </Card>
    );
};

// --- Основная страница ---
export default function Home({
    bhajanList,
    authors,
    ragas,
    types,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
    const router = useRouter();
    const { query } = router;

    // --- Управление избранным ---
    const useFavorites = () => {
        const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
            if (typeof window === 'undefined') return [];
            const storedFavorites = localStorage.getItem('bhajanFavorites');
            return storedFavorites ? JSON.parse(storedFavorites) : [];
        });

        const toggleFavorite = (bhajanId: string) => {
            const newFavoriteIds = favoriteIds.includes(bhajanId)
                ? favoriteIds.filter(id => id !== bhajanId)
                : [...favoriteIds, bhajanId];
            setFavoriteIds(newFavoriteIds);
            localStorage.setItem('bhajanFavorites', JSON.stringify(newFavoriteIds));
        };

        const isFavorite = (bhajanId: string) => favoriteIds.includes(bhajanId);
        
        return { favoriteIds, toggleFavorite, isFavorite };
    };

    const { favoriteIds, toggleFavorite, isFavorite } = useFavorites();
    
    // --- Состояние фильтров и поиска ---
    const [search, setSearch] = useState(query.search || "");
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [selectedAuthors, setAuthors] = useState<string[]>([]);
    const [selectedTypes, setTypes] = useState<string[]>([]);
    const [selectedRagas, setRagas] = useState<string[]>([]);

    const handleFilterChange = (setter: Function) => (event: ChangeEvent<HTMLInputElement>) => {
        const { value, checked } = event.target;
        setter((prev: string[]) => 
            checked ? [...prev, value] : prev.filter(item => item !== value)
        );
    };

    const resetFilters = () => {
        setSearch("");
        setAuthors([]);
        setTypes([]);
        setRagas([]);
        setFavoritesOnly(false);
    };

    // --- Логика фильтрации ---
    const filteredBhajanList = useMemo(() => {
        return bhajanList.filter((bhajan) => {
            const searchLower = search.toString().toLowerCase();
            const titleMatch = bhajan.title.ru.toLowerCase().includes(searchLower) || bhajan.title.en.toLowerCase().includes(searchLower);
            const authorMatch = !selectedAuthors.length || selectedAuthors.includes(bhajan.author);
            const typeMatch = !selectedTypes.length || selectedTypes.every(type => bhajan.options.includes(type));
            const ragaMatch = !selectedRagas.length || selectedRagas.every(raga => bhajan.options.includes(raga));
            const favoriteMatch = !favoritesOnly || favoriteIds.includes(bhajan.id);
            
            return titleMatch && authorMatch && typeMatch && ragaMatch && favoriteMatch;
        });
    }, [search, selectedAuthors, selectedTypes, selectedRagas, favoritesOnly, favoriteIds, bhajanList]);

    // --- Управление меню и диалогами ---
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [dialog, setDialog] = useState<string | null>(null);

    const handleMenu = (event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
    const handleCloseMenu = () => setAnchorEl(null);
    const openDialog = (type: string) => {
        setDialog(type);
        handleCloseMenu();
    };

    return (
        <>
            <Head>
                <title>Бхаджаны | Bhajan App</title>
                <meta name="description" content="Приложение для изучения и пения бхаджанов." />
                <link rel="icon" href="/favicon.ico" />
            </Head>

            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        Бхаджаны
                    </Typography>
                    <IconButton
                        size="large"
                        edge="start"
                        color="inherit"
                        aria-label="menu"
                        onClick={handleMenu}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Menu
                        anchorEl={anchorEl}
                        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                        keepMounted
                        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                        open={Boolean(anchorEl)}
                        onClose={handleCloseMenu}
                    >
                        <MenuItem onClick={() => openDialog('about')}>О нас</MenuItem>
                        <MenuItem onClick={() => openDialog('projects')}>Наши проекты</MenuItem>
                        <MenuItem onClick={() => openDialog('contact')}>Связаться с нами</MenuItem>
                        <MenuItem onClick={() => openDialog('donation')}>Пожертвовать</MenuItem>
                    </Menu>
                </Toolbar>
            </AppBar>

            <Container sx={{ mt: 2 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    {/* --- Панель фильтров --- */}
                    <Box sx={{ width: { xs: "100%", sm: 250 }, flexShrink: 0 }}>
                        <Typography variant="h5" gutterBottom>Фильтры</Typography>
                        <FormControl component="fieldset" variant="standard" fullWidth>
                            <FormGroup>
                                <FormControlLabel
                                    control={<Switch checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} />}
                                    label="Только избранные"
                                />
                                <Typography mt={2}>Авторы</Typography>
                                {authors.map(author => (
                                    <FormControlLabel key={author} control={<Checkbox value={author} checked={selectedAuthors.includes(author)} onChange={handleFilterChange(setAuthors)} />} label={author} />
                                ))}
                                <Typography mt={2}>Типы</Typography>
                                {types.map(type => (
                                    <FormControlLabel key={type} control={<Checkbox value={type} checked={selectedTypes.includes(type)} onChange={handleFilterChange(setTypes)} />} label={type} />
                                ))}
                                <Typography mt={2}>Раги</Typography>
                                {ragas.map(raga => (
                                    <FormControlLabel key={raga} control={<Checkbox value={raga} checked={selectedRagas.includes(raga)} onChange={handleFilterChange(setRagas)} />} label={raga} />
                                ))}
                            </FormGroup>
                        </FormControl>
                        <Button variant="outlined" fullWidth sx={{mt: 2}} onClick={resetFilters}>Сбросить фильтры</Button>
                    </Box>

                    {/* --- Список бхаджанов --- */}
                    <Box sx={{ flexGrow: 1 }}>
                        <FormControl fullWidth variant="standard" sx={{ mb: 2 }}>
                            <Input
                                id="search-bhajans"
                                placeholder="Поиск бхаджанов..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                startAdornment={<Search />}
                            />
                        </FormControl>
                        <Stack spacing={2}>
                            {filteredBhajanList.length > 0 ? (
                                filteredBhajanList.map((bhajan) => (
                                    <BhajanCard
                                        key={bhajan.id}
                                        bhajan={bhajan}
                                        isFavorite={isFavorite(bhajan.id)}
                                        onToggleFavorite={() => toggleFavorite(bhajan.id)}
                                    />
                                ))
                            ) : (
                                <Typography>Бхаджаны не найдены. Попробуйте изменить фильтры.</Typography>
                            )}
                        </Stack>
                    </Box>
                </Stack>
            </Container>

            {/* --- Диалоговые окна --- */}
            <Dialog onClose={() => setDialog(null)} open={dialog === 'about'}>
                <DialogTitle>О нас</DialogTitle>
                <DialogContent>
                    <Typography>
                        BhajanApp — приложение для тех, кто стремится глубже погрузиться в культуру бхаджанов и киртанов. Мы хотим сделать духовное наследие доступным для каждого, предоставив удобный инструмент для изучения и пения святых имен.
                    </Typography>
                </DialogContent>
            </Dialog>

            <Dialog onClose={() => setDialog(null)} open={dialog === 'projects'}>
                <DialogTitle>Наши проекты</DialogTitle>
                <DialogContent>
                    <List>
                        <ListItem>
                            <Link href="https://dandavat.store/" target="_blank">Dandavat Wear</Link>
                        </ListItem>
                        <ListItem>
                            <Link href="https://omhome.ru" target="_blank">OmHome</Link>
                        </ListItem>
                         <ListItem>
                            <Link href="https://www.instagram.com/kirtanmoscow/" target="_blank">Kirtan Moscow</Link>
                        </ListItem>
                    </List>
                </DialogContent>
            </Dialog>

            <Dialog onClose={() => setDialog(null)} open={dialog === 'contact'}>
                <DialogTitle>Связаться с нами</DialogTitle>
                <DialogContent>
                     <Typography>Telegram: <Link href="https://t.me/bhajanapp" target="_blank">@bhajanapp</Link></Typography>
                     <Typography>Email: <Link href="mailto:om@bhajan.app">om@bhajan.app</Link></Typography>
                     <Typography>Instagram: <Link href="https://www.instagram.com/bhajan.app" target="_blank">@bhajan.app</Link></Typography>
                </DialogContent>
            </Dialog>
            
            <Dialog onClose={() => setDialog(null)} open={dialog === 'donation'}>
                <DialogTitle>Пожертвовать</DialogTitle>
                <DialogContent>
                    <Typography>
                        Ваша поддержка помогает нам развивать проект, добавлять новые бхаджаны и функции. Вы можете сделать пожертвование на... (здесь можно добавить реквизиты или ссылку на сервис донатов).
                    </Typography>
                </DialogContent>
            </Dialog>

        </>
    );
}

// --- Получение данных на стороне сервера ---
export const getServerSideProps: GetServerSideProps = async (context) => {
    const bhajanList = await getBhajanList({});
    
    const authors = [...new Set(bhajanList.map(b => b.author))];
    const options = [...new Set(bhajanList.flatMap(b => b.options))];
    // Примерное разделение, можно улучшить, если у опций будут префиксы, например "raga:Kedar"
    const ragas = options.filter(o => o.startsWith("Рага")); 
    const types = options.filter(o => !o.startsWith("Рага"));

    return {
        props: {
            bhajanList,
            authors,
            ragas,
            types,
        },
    };
};
