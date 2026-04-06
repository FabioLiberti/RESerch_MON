import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Heading,
  Text,
  Input,
  InputGroup,
  InputLeftElement,
  Flex,
  Button,
  Select,
  Badge,
  Icon,
  SimpleGrid,
  Spinner,
  Center,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  IconButton,
  useColorModeValue,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Link,
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import {
  FiSearch,
  FiFilter,
  FiExternalLink,
  FiDownload,
  FiBookmark,
  FiInfo,
  FiAlertCircle,
} from 'react-icons/fi';
import PaperCard from '../common/PaperCard';
import { loadPapers, Paper } from '../../utils/dataLoader';

interface ResearchPapersGridProps {
  onPaperSelect: (paperId: string) => void;
}

const ResearchPapersGrid: React.FC<ResearchPapersGridProps> = ({ onPaperSelect }) => {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [filteredPapers, setFilteredPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState('newest');
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  
  const { isOpen, onOpen, onClose } = useDisclosure();
  
  // Colors
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const filterBgColor = useColorModeValue('gray.50', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'white');
  const subtleText = useColorModeValue('gray.600', 'gray.400');
  
  // Collect all unique tags from papers for filter options
  const allTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    papers.forEach(paper => {
      paper.tags.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [papers]);
  
  // Load papers data
  useEffect(() => {
    const fetchPapers = async () => {
      try {
        setLoading(true);
        const data = await loadPapers();
        setPapers(data);
        setFilteredPapers(data);
        setLoading(false);
      } catch (err) {
        console.error('Error loading papers:', err);
        setError('Failed to load research papers. Please try again later.');
        setLoading(false);
      }
    };
    
    fetchPapers();
  }, []);
  
  // Filter and sort papers when filters change
  useEffect(() => {
    if (papers.length === 0) return;
    
    let result = [...papers];
    
    // Apply search query filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        paper =>
          paper.title.toLowerCase().includes(query) ||
          paper.abstract.toLowerCase().includes(query) ||
          paper.authors.some(author => author.name.toLowerCase().includes(query))
      );
    }
    
    // Apply category filter
    if (categoryFilter) {
      result = result.filter(paper => paper.tags.includes(categoryFilter));
    }
    
    // Apply sorting
    if (sortOption === 'newest') {
      result.sort((a, b) => b.year - a.year);
    } else if (sortOption === 'oldest') {
      result.sort((a, b) => a.year - b.year);
    } else if (sortOption === 'title') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    }
    
    setFilteredPapers(result);
  }, [papers, searchQuery, categoryFilter, sortOption]);
  
  // Handle paper selection
  const handlePaperClick = (paper: Paper) => {
    setSelectedPaper(paper);
    onOpen();
    onPaperSelect(paper.id);
  };
  
  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter(null);
    setSortOption('newest');
  };
  
  // Format authors list for display
  const formatAuthors = (authors: { name: string; affiliation?: string }[]) => {
    return authors.map(author => author.name).join(', ');
  };
  
  if (loading) {
    return (
      <Center height="60vh">
        <Spinner size="xl" color="blue.500" thickness="4px" />
      </Center>
    );
  }
  
  if (error) {
    return (
      <Center height="60vh" flexDirection="column">
        <Icon as={FiAlertCircle as React.ElementType} color="red.500" boxSize={10} mb={4} />
        <Heading size="md" mb={2}>Error Loading Data</Heading>
        <Text>{error}</Text>
        <Button mt={4} colorScheme="blue" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </Center>
    );
  }
  
  return (
    <Box>
      <Heading as="h1" size="xl" mb={2}>
        Research Papers
      </Heading>
      <Text mb={6} color={subtleText}>
        Explore the latest research in federated learning from top academic conferences
      </Text>
      
      {/* Filters and Search */}
      <Flex
        direction={{ base: 'column', md: 'row' }}
        mb={6}
        gap={4}
        align={{ base: 'stretch', md: 'center' }}
      >
        <InputGroup maxW={{ base: '100%', md: '400px' }}>
          <InputLeftElement pointerEvents="none">
            <Icon as={FiSearch as React.ElementType} color="gray.300" />
          </InputLeftElement>
          <Input
            placeholder="Search papers by title, author, or keywords"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </InputGroup>
        
        <Flex gap={2} ml={{ base: 0, md: 'auto' }}>
          <Menu>
            <MenuButton 
              as={Button} 
              rightIcon={<ChevronDownIcon />} 
              leftIcon={<Icon as={FiFilter as React.ElementType} />}
              variant="outline"
            >
              All Categories
            </MenuButton>
            <MenuList>
              <MenuItem onClick={() => setCategoryFilter(null)} fontWeight={!categoryFilter ? 'bold' : 'normal'}>
                All Categories
              </MenuItem>
              <MenuDivider />
              {allTags.map(tag => (
                <MenuItem 
                  key={tag} 
                  onClick={() => setCategoryFilter(tag)}
                  fontWeight={categoryFilter === tag ? 'bold' : 'normal'}
                >
                  {tag.charAt(0).toUpperCase() + tag.slice(1)}
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
          
          <Select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            width={{ base: 'full', md: '180px' }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="title">Title (A-Z)</option>
          </Select>
          
          <IconButton
            aria-label="Export papers"
            icon={<Icon as={FiDownload as React.ElementType} />}
            variant="outline"
          />
        </Flex>
      </Flex>
      
      {/* Results count and clear filters */}
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontWeight="medium">
          Showing {filteredPapers.length} of {papers.length} papers
        </Text>
        
        {(searchQuery || categoryFilter || sortOption !== 'newest') && (
          <Button 
            variant="ghost" 
            colorScheme="blue"
            size="sm"
            onClick={clearFilters}
          >
            Clear Filters
          </Button>
        )}
      </Flex>
      
      {/* Papers Grid */}
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6} mb={8}>
        {filteredPapers.map(paper => (
          <Box key={paper.id} onClick={() => handlePaperClick(paper)}>
            <PaperCard
              title={paper.title}
              authors={formatAuthors(paper.authors)}
              conference={`${paper.conference} ${paper.year}`}
              imageUrl={`/images/papers/${paper.id}-thumbnail.jpg`}
            />
          </Box>
        ))}
      </SimpleGrid>
      
      {/* No results state */}
      {filteredPapers.length === 0 && (
        <Box
          p={8}
          textAlign="center"
          borderRadius="lg"
          bg={bgColor}
          borderWidth="1px"
          borderColor={borderColor}
        >
          <Icon as={FiInfo as React.ElementType} boxSize={10} color="blue.500" mb={4} />
          <Heading size="md" mb={2}>No Papers Found</Heading>
          <Text color={subtleText}>
            Try adjusting your search or filters to find what you're looking for.
          </Text>
        </Box>
      )}
      
      {/* Load more button */}
      {filteredPapers.length > 0 && filteredPapers.length < papers.length && (
        <Center mt={8}>
          <Button colorScheme="blue" variant="outline" size="lg">
            Load More Papers
          </Button>
        </Center>
      )}
      
      {/* Paper detail modal */}
      {selectedPaper && (
        <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{selectedPaper.title}</ModalHeader>
            <ModalCloseButton />
            <ModalBody pb={6}>
              <Flex gap={2} mb={4} flexWrap="wrap">
                {selectedPaper.tags.map(tag => (
                  <Badge key={tag} colorScheme={
                    tag === 'healthcare' || tag === 'cross-silo' ? 'green' :
                    tag === 'privacy' || tag === 'differential-privacy' || tag === 'security' ? 'red' :
                    tag === 'blockchain' || tag === 'incentives' ? 'orange' :
                    tag === 'computer-vision' || tag === 'heterogeneity' ? 'purple' :
                    tag === 'model-partitioning' || tag === 'resource-efficiency' || tag === 'edge-computing' ? 'blue' :
                    tag === 'communication-efficiency' || tag === 'dynamic-participation' ? 'teal' :
                    tag === 'regulatory' ? 'yellow' :
                    'gray'
                  }>
                    {tag}
                  </Badge>
                ))}
              </Flex>
              
              <Text fontWeight="medium" mb={2}>
                {formatAuthors(selectedPaper.authors)}
              </Text>
              
              <Text color={subtleText} mb={4}>
                {selectedPaper.conference}, {selectedPaper.year}
              </Text>
              
              <Text mb={6}>
                {selectedPaper.abstract}
              </Text>
              
              <Flex gap={2} justifyContent="flex-end">
                <Button 
                  leftIcon={<Icon as={FiBookmark as React.ElementType} />}
                  variant="ghost"
                >
                  Save
                </Button>
                {selectedPaper.url && (
                  <Button 
                    colorScheme="blue" 
                    rightIcon={<Icon as={FiExternalLink as React.ElementType} />}
                    as={Link}
                    href={selectedPaper.url}
                    isExternal
                  >
                    View Full Paper
                  </Button>
                )}
              </Flex>
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
    </Box>
  );
};

export default ResearchPapersGrid;